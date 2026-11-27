// ─────────────────────────────────────────────────────────────
// Chat message email notifications (Slice 1) — directive Phase 3.
//
// When a new chat message is stored on an Enquire thread, email the OTHER
// party a transactional "you have a new message" notice with a safe excerpt
// and a portal CTA (NOT a direct reply address). The reply path is always the
// platform portal.
//
// Invariants:
//   • The message is ALREADY persisted before we are called. Email is
//     best-effort and fire-and-forget: a send failure NEVER loses the chat and
//     NEVER blocks the request path.
//   • Sender is the verified brand address (MAIL_FROM || noreply@…). NEVER a
//     host/customer personal address.
//   • No PII beyond the sender's display name; the excerpt is HTML-escaped and
//     messages already passed contact-sharing moderation before storage.
//   • Delivery status is tracked on the message subdoc (chat.$.notify),
//     SEPARATE from chat state, with the recipient address stored MASKED.
// ─────────────────────────────────────────────────────────────
import { Resend } from "resend";
import { Enquire, Host, User } from "../models/index.js";

// Lazy client: constructing Resend eagerly throws when the key is absent (e.g.
// at import time in tests / a misconfigured boot). Build it only when sending.
let _resend = null;
const resendClient = () => {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
};
const FROM = () => process.env.MAIL_FROM || "Nomadic Townies <noreply@nomadictownies.com>";

export const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const excerptOf = (s, n = 140) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export const maskEmail = (email) => {
  const s = String(email || "");
  const at = s.indexOf("@");
  if (at <= 0) return s ? "***" : "";
  return `${s.slice(0, 1)}***${s.slice(at)}`;
};

const htmlBody = ({ heading, intro, excerpt, ctaUrl, ctaLabel }) => `
<!doctype html><html><body style="margin:0;background:#F4EEE4;font-family:Helvetica,Arial,sans-serif;color:#221C17">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#221C17;color:#F4EEE4;padding:16px 20px;border-radius:10px 10px 0 0">
      <div style="font-size:16px;font-weight:bold">Nomadic Townies</div>
    </div>
    <div style="background:#fff;padding:22px 20px;border:1px solid #E6DDCF;border-top:0;border-radius:0 0 10px 10px">
      <div style="font-size:15px;font-weight:bold;margin-bottom:6px">${esc(heading)}</div>
      <div style="font-size:13px;color:#726A5E;margin-bottom:14px">${esc(intro)}</div>
      <div style="font-size:14px;line-height:1.5;padding:12px 14px;background:#F9F6EF;border-left:3px solid #E9622F;border-radius:4px;color:#221C17">${esc(excerpt)}</div>
      <div style="margin:20px 0 6px">
        <a href="${esc(ctaUrl)}" style="display:inline-block;background:#E9622F;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:11px 20px;border-radius:6px">${esc(ctaLabel)}</a>
      </div>
      <div style="font-size:11px;color:#9C9388;margin-top:16px">Reply from the Nomadic Townies platform, not by replying to this email. For your safety, contact details shared in chat are moderated. Need help? ${esc(process.env.SUPPORT_EMAIL || "hello@nomadictownies.com")}</div>
    </div>
  </div>
</body></html>`;

const textBody = ({ heading, intro, excerpt, ctaUrl }) =>
  `${heading}\n\n${intro}\n\n"${excerptOf(excerpt)}"\n\nOpen the platform to read and reply: ${ctaUrl}\n\nReply from the platform, not by replying to this email. — Nomadic Townies`;

// Record delivery status on the exact message subdoc, without touching chat
// content (targeted $set; no full-doc re-save → no version races). Recipient is
// stored MASKED so a host-facing view never leaks the customer's raw address.
const recordStatus = async (enquiryId, messageId, notify) => {
  try {
    await Enquire.updateOne(
      { _id: enquiryId, "chat._id": messageId },
      { $set: { "chat.$.notify": notify } }
    );
  } catch (e) {
    console.error("chat notify status write failed:", e?.message || e);
  }
};

// Core: notify the recipient of ONE new message. toRole is the RECIPIENT.
// Fire-and-forget from the caller (do not await in the request path).
export const notifyNewChatMessage = async ({ enquiry, messageId, toRole }) => {
  try {
    if (!enquiry || !messageId || !toRole) return;
    const msg = (enquiry.chat || []).find((m) => String(m._id) === String(messageId));
    const excerpt = excerptOf(msg?.Message);

    // Resolve recipient + CTA by role.
    let to = "";
    let heading = "";
    let intro = "";
    let ctaUrl = "";
    let ctaLabel = "";
    let subject = "";

    if (toRole === "host") {
      const host = await Host.findById(enquiry.hostId).select("emailAddress hostTitle hostName").lean();
      to = host?.emailAddress || "";
      const who = enquiry.Name || "A traveller";
      heading = "New message from a traveller";
      intro = `${who} sent you a message on Nomadic Townies.`;
      ctaUrl = `${process.env.HOST_DASHBOARD_URL || "https://host.nomadictownies.com"}/enquiries?convo=${enquiry._id}`;
      ctaLabel = "View & reply";
      subject = "New message on Nomadic Townies";
    } else {
      // recipient = traveller/customer
      const buyer = await User.findById(enquiry.userId).select("email name").lean();
      to = buyer?.email || enquiry.Email || "";
      const host = await Host.findById(enquiry.hostId).select("hostTitle hostName").lean();
      const hostName = host?.hostTitle || host?.hostName || "Your host";
      heading = `New message from ${hostName}`;
      intro = `${hostName} replied to you on Nomadic Townies.`;
      ctaUrl = `${process.env.CLIENT_URL || "https://nomadictownies.com"}/profile`;
      ctaLabel = "View & reply";
      subject = `New message from ${hostName}`;
    }

    if (!to) {
      // Directive: show delivery unavailable while retaining the message.
      await recordStatus(enquiry._id, messageId, {
        to: toRole, email: "", status: "unavailable", attempts: 0, at: new Date(),
      });
      return;
    }
    if (!process.env.RESEND_API_KEY) {
      await recordStatus(enquiry._id, messageId, {
        to: toRole, email: maskEmail(to), status: "unknown", error: "RESEND_API_KEY not configured", attempts: 0, at: new Date(),
      });
      return;
    }

    const payload = { heading, intro, excerpt, ctaUrl, ctaLabel };
    const { data: sent, error } = await resendClient().emails.send({
      from: FROM(),
      to,
      subject,
      html: htmlBody(payload),
      text: textBody(payload),
    });

    if (error) {
      await recordStatus(enquiry._id, messageId, {
        to: toRole, email: maskEmail(to), status: "failed", error: String(error?.message || error).slice(0, 300), attempts: 1, at: new Date(),
      });
      return;
    }
    await recordStatus(enquiry._id, messageId, {
      to: toRole, email: maskEmail(to), status: "sent", providerId: sent?.id || "", attempts: 1, at: new Date(),
    });
  } catch (e) {
    console.error("notifyNewChatMessage failed:", e?.message || e);
  }
};
