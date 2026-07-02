import { Resend } from "resend";
import "dotenv/config";

const resend = new Resend(process.env.RESEND_API_KEY);

export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@nomadictownies.com";

const escapeHtml = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtINR = (n) => {
  const num = Number(String(n).toString().replace(/[^0-9.-]/g, ""));
  if (!isFinite(num)) return String(n ?? "0");
  return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

const firstName = (name) => {
  const n = String(name || "").trim();
  return n ? n.split(/\s+/)[0] : "there";
};

/**
 * Email-safe (table-based, inline-CSS, 600px single column) booking
 * confirmation template. Renders in Gmail, Outlook (MSO) and Apple Mail.
 * The header uses the text wordmark (reliably aligned in every client)
 * instead of an image logo.
 */
export const buildBookingConfirmationHtml = (data = {}) => {
  const {
    customer_name,
    booking_id,
    trip_name,
    host_name,
    batch_date,
    traveller_count,
    booking_date,
    booking_status,
    amount_paid,
    remaining_amount,
    payment_status,
    transaction_id,
    support_email = SUPPORT_EMAIL,
    view_booking_url = "https://nomadictownies.com/profile",
  } = data;

  const remainingNum = Number(String(remaining_amount ?? 0).replace(/[^0-9.-]/g, "")) || 0;
  const fullyPaid = remainingNum <= 0;
  const statusLabel = escapeHtml(payment_status || (fullyPaid ? "Fully paid" : "Partially paid"));
  const statusBg = fullyPaid ? "#E0EFE4" : "#F6E7CF";
  const statusFg = fullyPaid ? "#2E7D4F" : "#9A6A12";
  const hostInitial = escapeHtml((String(host_name || "N").trim()[0] || "N").toUpperCase());
  const greeting = escapeHtml(firstName(customer_name));
  const year = new Date().getFullYear();

  // detail rows (label / value) — no SVG, for maximum client compatibility
  const rows = [
    ["Booking ID", booking_id],
    ["Traveller", customer_name],
    ["Host", host_name],
    ["Batch date", batch_date],
    ["Travellers", traveller_count ? `${traveller_count} ${Number(traveller_count) === 1 ? "guest" : "guests"}` : ""],
    ["Booking date", booking_date],
    ["Status", booking_status],
    ["Transaction ID", transaction_id],
  ].filter(([, v]) => v != null && String(v).trim() !== "");

  const rowsHtml = rows
    .map(([label, value], i) => {
      const last = i === rows.length - 1;
      return `<tr>
        <td style="padding:14px 18px;border-bottom:${last ? "none" : "1px solid #F1EADD"};background:${i % 2 ? "#FFFDF9" : "#FFFFFF"};font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:13.5px;color:#8A8073;">${escapeHtml(label)}</td>
        <td align="right" style="padding:14px 18px;border-bottom:${last ? "none" : "1px solid #F1EADD"};background:${i % 2 ? "#FFFDF9" : "#FFFFFF"};font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#3C3228;">${escapeHtml(value)}</td>
      </tr>`;
    })
    .join("");

  const remainingBlock = fullyPaid
    ? ""
    : `<tr>
        <td style="padding:11px 0 0;border-top:1px dashed #E0CFBE;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:14px;color:#5A5247;">Remaining balance</td>
        <td align="right" style="padding:11px 0 0;border-top:1px dashed #E0CFBE;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#C0392B;">&#8377; ${escapeHtml(fmtINR(remainingNum))}</td>
      </tr>
      <tr><td colspan="2" style="padding:12px 0 0;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.5;color:#9A6A2E;">A balance of &#8377; ${escapeHtml(fmtINR(remainingNum))} is due before your batch start date to secure your seat.</td></tr>`;

  const safeUrl = escapeHtml(view_booking_url);

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Your Nomadic Townies booking is confirmed</title>
  <!--[if mso]><style type="text/css">body,table,td,h1,h2,p,span,a{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
    body{margin:0;padding:0;background:#EFE7DA;}
    a{text-decoration:none;}
    @media only screen and (max-width:600px){
      .nt-container{width:100% !important;}
      .nt-px{padding-left:22px !important;padding-right:22px !important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#EFE7DA;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">You're booked${trip_name ? ` — ${escapeHtml(trip_name)}` : ""}. Booking ${escapeHtml(booking_id || "")} confirmed.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EFE7DA;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" class="nt-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFDF9;border-radius:18px;overflow:hidden;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;">

          <!-- header band -->
          <tr>
            <td align="center" style="background:#221C17;padding:32px 34px 30px;text-align:center;">
              <div style="font-family:'Bricolage Grotesque',Arial,sans-serif;font-weight:800;font-size:22px;letter-spacing:-0.01em;margin-bottom:20px;">
                <span style="color:#E9622F;">nomadic</span><span style="color:#F4EEE4;">&nbsp;townies</span>
              </div>
              <div style="display:inline-block;width:58px;height:58px;line-height:58px;border-radius:50%;background:rgba(91,191,122,0.16);border:1px solid rgba(91,191,122,0.4);color:#7BD79A;font-size:30px;font-weight:700;">&#10003;</div>
              <h1 style="margin:16px 0 0;font-family:'Bricolage Grotesque',Arial,sans-serif;font-weight:700;font-size:28px;line-height:1.1;letter-spacing:-0.02em;color:#F8F4ED;">Your trip is booked!</h1>
              <p style="margin:9px 0 0;font-size:15px;line-height:1.5;color:#C9BFAE;">Thanks ${greeting} — we can&rsquo;t wait to host you.</p>
            </td>
          </tr>

          <!-- content -->
          <tr>
            <td class="nt-px" style="padding:34px 36px;">

              <!-- trip title + status -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:top;">
                    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#A89C8A;font-weight:600;">Your experience</div>
                    <h2 style="margin:8px 0 0;font-family:'Bricolage Grotesque',Arial,sans-serif;font-weight:700;font-size:23px;line-height:1.15;letter-spacing:-0.01em;color:#221C17;">${escapeHtml(trip_name || "Your experience")}</h2>
                  </td>
                  <td align="right" style="vertical-align:top;white-space:nowrap;">
                    <span style="display:inline-block;padding:7px 13px;border-radius:99px;background:${statusBg};color:${statusFg};font-size:11px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;">&#9679; ${statusLabel}</span>
                  </td>
                </tr>
              </table>

              <!-- detail rows -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border:1px solid #EFE7DA;border-radius:14px;overflow:hidden;">
                ${rowsHtml}
              </table>

              <!-- payment summary -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;background:#FBF6EE;border:1px solid #EAD9C9;border-radius:14px;">
                <tr><td style="padding:18px 20px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:14px;color:#5A5247;">Amount paid</td>
                      <td align="right" style="font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#2E7D4F;">&#8377; ${escapeHtml(fmtINR(amount_paid))}</td>
                    </tr>
                    ${remainingBlock}
                  </table>
                </td></tr>
                <tr><td style="padding:12px 20px 18px;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:12.5px;color:#8A8073;">Payment status: <strong style="color:#3C3228;">${statusLabel}</strong>${transaction_id ? ` &middot; Txn ${escapeHtml(transaction_id)}` : ""}</td></tr>
              </table>

              <!-- CTA (bulletproof) -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
                <tr><td align="center">
                  <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="25%" strokecolor="#CF4A2C" fillcolor="#CF4A2C"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">View booking &#8594;</center></v:roundrect><![endif]-->
                  <!--[if !mso]><!-- --><a href="${safeUrl}" style="display:inline-block;padding:15px 34px;background:#CF4A2C;color:#ffffff;border-radius:12px;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;">View booking &#8594;</a><!--<![endif]-->
                  <div style="margin-top:12px;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.5;color:#9A9080;">Manage your trip, download your voucher and message your host anytime.</div>
                </td></tr>
              </table>

              <!-- host card -->
              ${host_name ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border:1px solid #EFE7DA;border-radius:14px;background:#FFFFFF;">
                <tr>
                  <td width="46" style="padding:16px 0 16px 18px;">
                    <div style="width:46px;height:46px;line-height:46px;text-align:center;border-radius:12px;background:#CF4A2C;color:#FFF6EF;font-family:'Bricolage Grotesque',Arial,sans-serif;font-weight:700;font-size:19px;">${hostInitial}</div>
                  </td>
                  <td style="padding:16px 18px;">
                    <div style="font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:12px;color:#9A9080;">Your host</div>
                    <div style="margin-top:3px;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#221C17;">${escapeHtml(host_name)}</div>
                  </td>
                </tr>
              </table>` : ""}

              <p style="margin:24px 0 0;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.6;color:#8A8073;">Keep this email for your records. Need a hand? Reach us anytime at <a href="mailto:${escapeHtml(support_email)}" style="color:#CF4A2C;font-weight:600;">${escapeHtml(support_email)}</a>.</p>
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td style="padding:24px 34px;border-top:1px solid #EFE7DA;background:#FFFDF9;">
              <div style="font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-weight:600;font-size:14px;color:#221C17;">Nomadic Townies</div>
              <p style="margin:6px 0 0;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#9A9080;">Curated, host-led travel experiences.<br>This is an automated message — please do not reply directly.</p>
              <p style="margin:14px 0 0;">
                <a href="https://nomadictownies.com" style="font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-weight:600;font-size:12px;color:#CF4A2C;">Help Center</a>&nbsp;&nbsp;&nbsp;
                <a href="https://nomadictownies.com/cancellation-and-refund" style="font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-weight:600;font-size:12px;color:#CF4A2C;">Cancellation Policy</a>&nbsp;&nbsp;&nbsp;
                <a href="https://nomadictownies.com/terms-and-conditions" style="font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-weight:600;font-size:12px;color:#CF4A2C;">Terms</a>
              </p>
              <p style="margin:14px 0 0;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#B8AE9E;">&copy; ${year} Nomadic Townies. Pune, Maharashtra, India.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Send the booking confirmation email. Never throws — logs and resolves false
 * on failure so the booking/payment flow is never broken by email issues.
 */
export const sendBookingConfirmationEmail = async (to, data = {}) => {
  try {
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to).trim())) {
      console.error(`sendBookingConfirmationEmail: no valid recipient (booking ${data.booking_id || "?"}) — skipped`);
      return false;
    }
    if (!process.env.RESEND_API_KEY) {
      console.error("sendBookingConfirmationEmail: RESEND_API_KEY is not set — skipped");
      return false;
    }
    // Resend returns { data, error } and does NOT throw on API-level errors
    // (e.g. unverified sender domain, blocked recipient) — inspect error.
    const { data: res, error } = await resend.emails.send({
      from: "Nomadic Townies <noreply@nomadictownies.com>",
      to: String(to).trim(),
      subject: `You're booked! ${data.trip_name || "Your experience"}${data.booking_id ? ` · ${data.booking_id}` : ""}`,
      html: buildBookingConfirmationHtml(data),
    });
    if (error) {
      console.error(`sendBookingConfirmationEmail: Resend rejected (booking ${data.booking_id || "?"}):`, error?.message || JSON.stringify(error));
      return false;
    }
    console.log(`Booking confirmation email sent (booking ${data.booking_id || "?"}, id ${res?.id || "n/a"})`);
    return true;
  } catch (err) {
    console.error("sendBookingConfirmationEmail failed:", err?.message || err);
    return false;
  }
};
