import crypto from "crypto";
import { Resend } from "resend";
import {
  uploadFilesToS3,
  aadhaarMulter,
  uploadPrivateToS3,
  getPrivateObjectStream,
  deletePrivateFromS3,
} from "../middlewares/index.js";
import {
  sniffImageType,
  mergeAadhaarDocs,
  sideField,
  AADHAAR_SIDES,
} from "../utils/aadhaarStorage.js";
import { recomputeSections } from "../utils/tripPricing.js";
import { Host } from "../models/hosts.js";
import { containsContactInfo, CONTACT_WARNING } from "../utils/contactModeration.js";
import { validateMessage, serializeEnquiryForParticipant } from "../utils/chatSerialize.js";
import { isEarningBooking, earningRevenue } from "../utils/bookingRevenue.js";
import jwt from "jsonwebtoken";
import { addClient, removeClient } from "../services/hostEvents.js";
import { saveSubscription, removeSubscription, vapidPublicKey } from "../services/webPush.js";
import { User } from "../models/user.js";
import { Trips } from "../models/trips.js";
import { Bookings } from "../models/bookings.js";
import { Enquire } from "../models/enquire.js";
import { Notification } from "../models/notifications.js";
import Payout from "../models/payouts.js";

/** Fire-and-forget notification creation (never blocks the main flow). */
export async function notifyHost(hostId, type, title, body, data = undefined) {
  try {
    await Notification.create({
      recipientType: "host",
      recipientId: String(hostId),
      type,
      title,
      body,
      data,
    });
  } catch (e) {
    console.error("notifyHost failed:", e?.message);
  }
}

/* ------------------------------------------------------------------
 * Host Portal (Host Dashboard) — self-scoped endpoints.
 * All routes are JWT-guarded; the Host record is resolved from the
 * authenticated user (never from a client-supplied id), so a host can
 * only ever read their own data. Additive module: no existing
 * controller/route is modified.
 * ------------------------------------------------------------------ */

/** Resolve the Host record for the authenticated user:
 *  1) explicit Host.user link, 2) fallback: emailAddress match. */
async function resolveHost(user) {
  if (!user) return null;
  let host = await Host.findOne({ user: user._id });
  if (!host && user.email) {
    host = await Host.findOne({
      emailAddress: { $regex: `^${user.email}$`, $options: "i" },
    });
  }
  return host;
}

async function requireHost(req, res) {
  const host = await resolveHost(req.user);
  if (!host) {
    res.status(404).json({
      success: false,
      message: "No host profile is linked to this account.",
    });
    return null;
  }
  // Admin kill-switch: dashboard access disabled (data intact, login blocked).
  if (host.dashboardAccess === false) {
    res.status(403).json({
      success: false,
      code: "DASHBOARD_DISABLED",
      message:
        "Your dashboard access is currently disabled. Please contact Nomadic Townies support.",
    });
    return null;
  }
  return host;
}

// GET /host-portal/me
export const getMyHost = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  return res.status(200).json({ success: true, data: host });
};

// GET /host-portal/me/trips
export const getMyTrips = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const trips = await Trips.find({ host: host._id }).sort({ date: -1 });
  return res.status(200).json({ success: true, data: trips });
};

// GET /host-portal/me/bookings — bookings on any of this host's trips.
// Traveller contact stays platform-safe: only name/city/lead exposed.
export const getMyBookings = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const trips = await Trips.find({ host: host._id }).select("_id title");
  const tripIds = trips.map((t) => String(t._id));
  const titleById = Object.fromEntries(trips.map((t) => [String(t._id), t.title]));
  const bookings = await Bookings.find({ tripId: { $in: tripIds } }).sort({ DateOfBooking: -1 });
  const safe = bookings.map((b) => ({
    _id: b._id,
    bookingId: b.bookingId,
    tripId: b.tripId,
    tripTitle: titleById[b.tripId] ?? "—",
    total: b.total ?? 0,
    paymentStatus: b.paymentStatus ?? "",
    status: b.status ?? "",
    DateOfBooking: b.DateOfBooking,
    travellerName: b.userName || b.travellers?.find((t) => t.isLead)?.name || b.travellers?.[0]?.name || "Traveller",
    travellerCount: Array.isArray(b.travellers) && b.travellers.length ? b.travellers.length : 1,
  }));
  return res.status(200).json({ success: true, data: safe });
};

// GET /host-portal/me/enquiries — only enquiries explicitly linked to this host.
export const getMyEnquiries = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const enquiries = await Enquire.find({ hostId: String(host._id) }).sort({ Date: -1 });
  const safe = enquiries.map(serializeEnquiryForParticipant);
  return res.status(200).json({ success: true, data: safe });
};

// GET /host-portal/me/push/key — VAPID public key for the client.
export const getPushKey = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  return res.status(200).json({ success: true, publicKey: vapidPublicKey() });
};

// POST /host-portal/me/push/subscribe { subscription, userAgent }
export const subscribePush = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  try {
    await saveSubscription(host._id, req.body?.subscription, req.body?.userAgent);
    return res.status(201).json({ success: true });
  } catch {
    return res.status(400).json({ success: false, message: "Invalid subscription." });
  }
};

// POST /host-portal/me/push/unsubscribe { endpoint }
export const unsubscribePush = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  await removeSubscription(req.body?.endpoint);
  return res.status(200).json({ success: true });
};

// GET /host-portal/me/events?token=JWT — Server-Sent Events stream.
// EventSource cannot send Authorization headers, so the JWT arrives as a
// query param (HTTPS only). Events carry no message body or PII.
export const streamMyEvents = async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).json({ success: false, message: "Token required." });
  let user;
  try {
    const payload = jwt.verify(String(token), process.env.APP_SECRET);
    user = await User.findById(payload._id);
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token." });
  }
  const host = await resolveHost(user);
  if (!host) return res.status(404).json({ success: false, message: "Host not found." });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx buffering
  });
  res.write(`event: ready\ndata: {"ok":true}\n\n`);
  addClient(host._id, res);
  const heartbeat = setInterval(() => {
    try { res.write(": hb\n\n"); } catch { /* cleaned up on close */ }
  }, 25000);
  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(host._id, res);
  });
};

/* ------------------------------------------------------------------
 * POST /host-portal/activate/:hostId  (ADMIN ONLY)
 * Approval → account creation: creates (or links) the host's login User,
 * marks the host approved+verified, and emails credentials. Additive —
 * the existing PATCH /host/:id/status flow is unchanged.
 * ------------------------------------------------------------------ */
export const activateHost = async (req, res) => {
  if (String(req.user?.role).toLowerCase() !== "admin") {
    return res.status(403).json({ success: false, message: "Admin only." });
  }

  const host = await Host.findById(req.params.hostId);
  if (!host) {
    return res.status(404).json({ success: false, message: "Host not found" });
  }
  if (!host.emailAddress) {
    return res.status(400).json({ success: false, message: "Host has no email address." });
  }

  // Idempotent activate / resend: every click (re)issues a fresh temporary
  // password and re-emails the dashboard link + credentials — whether or not a
  // login account already exists. Find the linked user (by id or email), or
  // create one. Always set a new password so the email always carries a working
  // one.
  const tempPassword = crypto.randomBytes(9).toString("base64url"); // ~12 chars
  // The host's login account is ALWAYS the User whose email == host.emailAddress
  // (that's what login checks). Resolve strictly by that email — never trust a
  // stale host.user link, which can point at the wrong account (e.g. the admin
  // who created the host). Resetting that would hijack another account.
  const emailRe = `^${String(host.emailAddress).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
  let user = await User.findOne({ email: { $regex: emailRe, $options: "i" } });

  // Never touch an admin account through this flow.
  if (user && String(user.role).toLowerCase() === "admin") {
    return res.status(409).json({
      success: false,
      message: "This email belongs to an admin account — use a different host email.",
    });
  }

  if (user) {
    user.role = "Host";
    user.password = tempPassword; // reset — hashed by the User pre-save hook
    user.isVerified = true;
    await user.save();
  } else {
    user = await new User({
      name: host.hostTitle || host.hostName || "Host",
      email: host.emailAddress,
      password: tempPassword, // hashed by the User pre-save hook
      role: "Host",
      isVerified: true,
    }).save();
  }

  host.user = user._id; // (re)link to the correct host-owned account
  host.status = "approved";
  host.isVerified = true;
  host.dashboardAccess = true; // activation enables dashboard login
  await host.save();

  // The invite MUST point at the PUBLIC production host dashboard — never a
  // Vercel *preview* deployment, which Vercel Deployment Protection gates behind
  // a Vercel login (the reported "sign into Vercel" screen). Set
  // HOST_DASHBOARD_URL to the production domain (e.g. https://host.nomadictownies.com)
  // and ensure Vercel Authentication/Deployment Protection is OFF for that
  // production deployment (the app guards itself via its own /login).
  const dashboardBase = (process.env.HOST_DASHBOARD_URL || "https://host.nomadictownies.com").replace(/\/+$/, "");
  if (!process.env.HOST_DASHBOARD_URL) {
    console.warn("activateHost: HOST_DASHBOARD_URL not set — using production default; set it to the public host dashboard domain.");
  }
  const dashboardUrl = `${dashboardBase}/login`;

  await notifyHost(
    host._id,
    "account",
    "Your Host Dashboard login",
    "Your dashboard login credentials have been emailed to you."
  );

  // Email credentials + dashboard link. Failure is non-fatal: the admin gets
  // the temp password back in the response to share manually.
  let emailSent = false;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const sent = await resend.emails.send({
      from: "Nomadic Townies <noreply@nomadictownies.com>",
      to: host.emailAddress,
      subject: "Your Nomadic Townies Host Dashboard login",
      html: `
        <p>Hi ${host.hostTitle || host.hostName},</p>
        <p>Your Host Dashboard is ready. Sign in with the credentials below:</p>
        <p><b>Dashboard:</b> <a href="${dashboardUrl}">${dashboardUrl}</a><br/>
        <b>Email:</b> ${host.emailAddress}<br/>
        <b>Temporary password:</b> ${tempPassword}</p>
        <p style="margin:18px 0"><a href="${dashboardUrl}" style="background:#CF4A2C;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;display:inline-block">Open your dashboard →</a></p>
        <p>Please change your password after your first login. This password replaces any previous one.</p>
        <p>— Nomadic Townies</p>`,
    });
    // Resend v1 returns { data, error } rather than throwing.
    if (sent?.error) throw new Error(sent.error.message || "Resend error");
    emailSent = true;
  } catch (e) {
    console.error("activateHost: credential email failed:", e?.message);
  }

  return res.status(200).json({
    success: true,
    message: `Credentials ${emailSent ? "emailed to the host" : "generated (email failed — share manually)"}.`,
    data: {
      hostId: host._id,
      userId: user._id,
      email: host.emailAddress,
      emailSent,
      // Returned only when the email failed, so the admin can share manually.
      ...(!emailSent ? { tempPassword } : {}),
    },
  });
};

// GET /host-portal/me/notifications
export const getMyNotifications = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const items = await Notification.find({
    recipientType: "host",
    recipientId: String(host._id),
  })
    .sort({ createdAt: -1 })
    .limit(100);
  const unread = items.filter((n) => !n.isRead).length;
  return res.status(200).json({ success: true, unread, data: items });
};

// POST /host-portal/me/notifications/read  { id? } — one or all read.
export const markMyNotificationsRead = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const filter = { recipientType: "host", recipientId: String(host._id) };
  if (req.body?.id) filter._id = req.body.id;
  const r = await Notification.updateMany(filter, { isRead: true });
  return res.status(200).json({ success: true, modified: r.modifiedCount ?? 0 });
};

// PUT /host-portal/me — host updates their OWN profile (whitelisted fields).
// Status/verification/user-link/PAN are never editable here.
const EDITABLE_HOST_FIELDS = [
  "hostTitle", "tagline", "hostOverview", "shortBio", "phoneNumber", "whatsapp",
  "location", "city", "state", "pincode", "completeAddress", "foundedYear",
  "experience", "hqLocation", "supportHours", "languages", "specialties",
  "achievements", "socialMedia", "seoTitle", "seoSlug", "metaDescription",
  "regions", "hostName",
];
export const updateMyHost = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const updates = {};
  for (const k of EDITABLE_HOST_FIELDS) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  const updated = await Host.findByIdAndUpdate(host._id, updates, { new: true });
  return res.status(200).json({ success: true, message: "Profile updated.", data: updated });
};

// POST /host-portal/me/submit-verification — host submits profile + docs for
// admin review. Requires the minimum profile + at least PAN + bank passbook.
// Sets status=pending ("Under Review"); admin approves/rejects afterwards.
export const submitMyVerification = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;

  const missing = [];
  if (!host.hostTitle && !host.hostName) missing.push("business name");
  if (!host.hostOverview && !host.shortBio) missing.push("bio");
  if (!host.phoneNumber) missing.push("phone number");
  if (!(host.languages || []).length) missing.push("languages");
  if (!(host.specialties || []).length) missing.push("specialties");
  const docs = host.documents || {};
  if (!docs.panCard) missing.push("PAN card");
  if (!docs.bankPassbook) missing.push("bank passbook");

  if (missing.length) {
    return res.status(400).json({
      success: false,
      message: `Complete before submitting: ${missing.join(", ")}.`,
      missing,
    });
  }

  host.status = "pending";
  host.rejectionReason = "";
  await host.save();
  await notifyHost(host._id, "account", "Verification submitted", "Your profile and documents are under admin review.");
  return res.status(200).json({ success: true, message: "Submitted for verification.", data: { status: host.status } });
};

// POST /host-portal/me/enquiries/:id/reply — host replies to an enquiry on
// their own trip (platform-safe; appends to the chat thread).
export const replyToEnquiry = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const { text, error } = validateMessage(req.body?.message);
  if (error) return res.status(400).json({ success: false, message: error });
  const enquiry = await Enquire.findOne({ _id: req.params.id, hostId: String(host._id) });
  if (!enquiry) {
    return res.status(404).json({ success: false, message: "Enquiry not found." });
  }
  // Platform-mediated chat: block contact-sharing, pause after repeats.
  const pausedUntil = enquiry?.moderation?.pausedUntil;
  if (pausedUntil && new Date(pausedUntil) > new Date()) {
    return res.status(429).json({ success: false, code: "CHAT_PAUSED", message: "Chat is paused for a while after repeated attempts to share contact details. Try again later." });
  }
  if (containsContactInfo(text)) {
    enquiry.moderation = enquiry.moderation || {};
    enquiry.moderation.violations = (enquiry.moderation.violations || 0) + 1;
    if (enquiry.moderation.violations >= 3) {
      enquiry.moderation.pausedUntil = new Date(Date.now() + 60 * 60 * 1000);
      enquiry.moderation.violations = 0;
    }
    await enquiry.save();
    return res.status(422).json({ success: false, code: "CONTACT_BLOCKED", message: CONTACT_WARNING });
  }
  enquiry.chat = enquiry.chat || [];
  enquiry.chat.push({ MessageBy: "host", Message: text, timeStamp: new Date() });
  enquiry.Reply = text;
  enquiry.status = "Replied";
  enquiry.userUnread = (enquiry.userUnread || 0) + 1;
  await enquiry.save();
  return res.status(200).json({ success: true, data: serializeEnquiryForParticipant(enquiry) });
};

// Shared guard: find the host's own enquiry + the host-authored, live message.
const findHostOwnMessage = async (req, res, host) => {
  const enquiry = await Enquire.findOne({ _id: req.params.id, hostId: String(host._id) });
  if (!enquiry) {
    res.status(404).json({ success: false, message: "Enquiry not found." });
    return {};
  }
  const msg = (enquiry.chat || []).id(req.params.msgId);
  if (!msg) {
    res.status(404).json({ success: false, message: "Message not found." });
    return { enquiry };
  }
  // Ownership: a host may only touch messages they authored.
  if (String(msg.MessageBy).toLowerCase() !== "host") {
    res.status(403).json({ success: false, message: "You can only edit or delete your own messages." });
    return { enquiry };
  }
  if (msg.deleted) {
    res.status(409).json({ success: false, message: "This message was deleted." });
    return { enquiry };
  }
  return { enquiry, msg };
};

// PUT /host-portal/me/enquiries/:id/messages/:msgId — host edits own message.
export const editMyEnquiryMessage = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const { text, error } = validateMessage(req.body?.message);
  if (error) return res.status(400).json({ success: false, message: error });
  const { enquiry, msg } = await findHostOwnMessage(req, res, host);
  if (!msg) return;
  // Optimistic-concurrency guard against a stale overwrite.
  if (req.body?.expectedTimeStamp && msg.editedAt &&
      new Date(req.body.expectedTimeStamp).getTime() !== new Date(msg.editedAt).getTime()) {
    return res.status(409).json({ success: false, code: "CONFLICT", message: "This message changed since you opened it. Reload and try again." });
  }
  // Re-run contact moderation on the edited content (server is authority).
  const pausedUntil = enquiry?.moderation?.pausedUntil;
  if (pausedUntil && new Date(pausedUntil) > new Date()) {
    return res.status(429).json({ success: false, code: "CHAT_PAUSED", message: "Chat is paused for a while after repeated attempts to share contact details. Try again later." });
  }
  if (containsContactInfo(text)) {
    enquiry.moderation = enquiry.moderation || {};
    enquiry.moderation.violations = (enquiry.moderation.violations || 0) + 1;
    if (enquiry.moderation.violations >= 3) {
      enquiry.moderation.pausedUntil = new Date(Date.now() + 60 * 60 * 1000);
      enquiry.moderation.violations = 0;
    }
    await enquiry.save();
    return res.status(422).json({ success: false, code: "CONTACT_BLOCKED", message: CONTACT_WARNING });
  }
  if (text === msg.Message) {
    return res.status(200).json({ success: true, data: serializeEnquiryForParticipant(enquiry) });
  }
  msg.history = msg.history || [];
  msg.history.push({ Message: msg.Message, editorRole: "host", at: new Date(), action: "edit" });
  msg.Message = text;
  msg.edited = true;
  msg.editedAt = new Date();
  await enquiry.save();
  return res.status(200).json({ success: true, data: serializeEnquiryForParticipant(enquiry) });
};

// DELETE /host-portal/me/enquiries/:id/messages/:msgId — host soft-deletes own message.
export const deleteMyEnquiryMessage = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const { enquiry, msg } = await findHostOwnMessage(req, res, host);
  if (!msg) return;
  // Preserve the original for admin/forensic review, then tombstone it.
  msg.history = msg.history || [];
  msg.history.push({ Message: msg.Message, editorRole: "host", at: new Date(), action: "delete" });
  msg.deleted = true;
  msg.deletedAt = new Date();
  msg.deletedBy = "host";
  // Keep the original content in Message for admins; participant APIs mask it.
  await enquiry.save();
  return res.status(200).json({ success: true, data: serializeEnquiryForParticipant(enquiry) });
};

// PUT /host-portal/me/trips/:id — host edits their OWN trip and resubmits.
// Any edit returns the trip to "pending" for admin re-review. Text fields
// only (images unchanged); Status/host cannot be set by the host.
//
// commissionRate is ADMIN-ONLY and deliberately NOT in this list — the markup
// belongs to the platform. `addsection` is handled separately below so the
// server (not the client) computes each option's selling price.
const HOST_EDITABLE_TRIP_FIELDS = [
  "title", "subTitle", "days", "nights", "location", "pickUp", "dropOff",
  "categories", "overview", "type", "price", "strikePrice",
  "firstBookingPrice", "Inclusion", "Exclusion", "ThingsToCarry", "Cancellation",
  "highlights", "numberOfDays", "numberOfSeats", "selectDate", "endSelectDate",
  "addDays", "tripOff", "metaDescription", "seoSlug", "seoTitle",
];
export const updateMyTrip = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const trip = await Trips.findOne({ _id: req.params.id, host: host._id });
  if (!trip) {
    return res.status(404).json({ success: false, message: "Trip not found." });
  }

  // A host must not set their own markup. Ignore any attempt and log it.
  if (req.body.commissionRate !== undefined &&
      `${req.body.commissionRate}` !== `${trip.commissionRate ?? ""}`) {
    console.warn(`[security] host ${host._id} attempted commissionRate change on trip ${trip._id} — ignored`);
  }

  for (const k of HOST_EDITABLE_TRIP_FIELDS) {
    if (req.body[k] !== undefined) trip[k] = req.body[k];
  }

  // Booking options: recompute every option's selling price (TitlePrice) from
  // its hostB2BPrice at the host's AUTHORITATIVE admin markup — the client's
  // TitlePrice/markupRate are never trusted. Options without a B2B keep their
  // stored (legacy) selling price. Order + identity preserved.
  if (req.body.addsection !== undefined) {
    const recomputed = recomputeSections(req.body.addsection, host.commissionRate);
    trip.addsection = JSON.stringify(recomputed);
  }

  trip.Status = "pending"; // resubmission → re-review
  trip.adminFeedback = "";
  trip.enableBooking = false;
  await trip.save();
  return res.status(200).json({ success: true, message: "Trip updated and resubmitted for review.", data: trip });
};

// POST /host-portal/me/documents — host uploads their OWN verification
// documents (panCard | gstCertificate | bankPassbook | businessLicense).
// Uploading resets host verification to pending for admin re-review.
export const uploadMyDocuments = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;

  const fields = [
    { name: "panCard", maxCount: 1 },
    { name: "gstCertificate", maxCount: 1 },
    { name: "bankPassbook", maxCount: 1 },
    { name: "businessLicense", maxCount: 1 },
  ];

  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: "Upload failed: " + err.message });
    }
    if (!req.uploadedFiles || Object.keys(req.uploadedFiles).length === 0) {
      return res.status(400).json({ success: false, message: "No document uploaded." });
    }
    const docs = { ...(host.documents || {}) };
    for (const f of fields) {
      const up = req.uploadedFiles[f.name];
      if (up && up[0]) docs[f.name] = up[0].url;
    }
    host.documents = docs;
    host.isVerified = false; // new docs → admin must re-verify
    if (host.status === "approved") host.status = "pending";
    await host.save();
    return res.status(200).json({ success: true, message: "Document uploaded — pending admin verification.", data: host.documents });
  });
};

// POST /host-portal/me/documents/aadhaar — host uploads their OWN Aadhaar card
// as one logical group with two independent sides (aadhaarFront / aadhaarBack).
// Either side may be sent; the untouched side is preserved. Stored PRIVATE
// (object key only, never a public URL). Uploading resets verification to
// pending for admin re-review — never auto-marks KYC verified.
export const uploadMyAadhaar = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;

  aadhaarMulter(req, res, async (err) => {
    if (err) {
      return res
        .status(400)
        .json({ success: false, message: "Upload failed: " + err.message });
    }
    const files = req.files || {};
    const front = files.aadhaarFront?.[0];
    const back = files.aadhaarBack?.[0];
    if (!front && !back) {
      return res
        .status(400)
        .json({ success: false, message: "No Aadhaar image uploaded." });
    }

    // Validate real image bytes (magic number), not the client's extension/mime.
    const uploaded = {};
    const newKeys = [];
    try {
      for (const [field, file] of [
        ["aadhaarFront", front],
        ["aadhaarBack", back],
      ]) {
        if (!file) continue;
        const mime = sniffImageType(file.buffer);
        if (!mime) {
          // Roll back anything already stored this request.
          await Promise.all(newKeys.map(deletePrivateFromS3));
          return res.status(400).json({
            success: false,
            message: "Aadhaar images must be JPEG, PNG or WebP.",
          });
        }
        const key = await uploadPrivateToS3(file.buffer, mime);
        newKeys.push(key);
        uploaded[field] = key;
      }
    } catch (e) {
      await Promise.all(newKeys.map(deletePrivateFromS3));
      return res
        .status(500)
        .json({ success: false, message: "Storage error. Try again." });
    }

    const { documents, replacedKeys } = mergeAadhaarDocs(host.documents, uploaded);
    host.documents = documents;
    host.isVerified = false; // new docs → admin must re-verify
    if (host.status === "approved") host.status = "pending";
    await host.save();
    // Delete superseded private files after the save commits.
    await Promise.all(replacedKeys.map(deletePrivateFromS3));

    return res.status(200).json({
      success: true,
      message: "Aadhaar uploaded — pending admin verification.",
      data: {
        aadhaarFront: !!host.documents.aadhaarFront,
        aadhaarBack: !!host.documents.aadhaarBack,
        status: host.status,
      },
    });
  });
};

// GET /host-portal/me/documents/aadhaar/:side — stream the host's OWN Aadhaar
// side through this authenticated route. The private object is never exposed as
// a public URL; this is the only read path for the host.
export const streamMyAadhaar = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const { side } = req.params;
  if (!AADHAAR_SIDES.includes(side)) {
    return res.status(400).json({ success: false, message: "Invalid side." });
  }
  const key = host.documents?.[sideField(side)];
  if (!key) {
    return res.status(404).json({ success: false, message: "Not uploaded." });
  }
  try {
    const { body, contentType, contentLength } = await getPrivateObjectStream(key);
    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    res.setHeader("Cache-Control", "private, no-store");
    body.pipe(res);
  } catch (e) {
    return res.status(404).json({ success: false, message: "File unavailable." });
  }
};

// GET /host-portal/me/analytics — per-trip views/bookings/revenue + totals.
export const getMyAnalytics = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;

  const trips = await Trips.find({ host: host._id }).select("_id title viewCount Status enableBooking");
  const tripIds = trips.map((t) => String(t._id));
  const bookings = await Bookings.find({ tripId: { $in: tripIds } }).select("tripId total paymentStatus status");

  const byTrip = trips.map((t) => {
    // Count only paid, non-cancelled bookings — no pending/refunded/failed inflation.
    const b = bookings.filter((x) => x.tripId === String(t._id) && isEarningBooking(x));
    const revenue = b.reduce((s, x) => s + (Number(x.total) || 0), 0);
    const views = Number(t.viewCount) || 0;
    return {
      tripId: t._id,
      title: t.title,
      views,
      bookings: b.length,
      revenue,
      conversion: views > 0 ? Number(((b.length / views) * 100).toFixed(1)) : 0,
    };
  });

  const totals = byTrip.reduce(
    (a, t) => ({
      views: a.views + t.views,
      bookings: a.bookings + t.bookings,
      revenue: a.revenue + t.revenue,
    }),
    { views: 0, bookings: 0, revenue: 0 },
  );

  return res.status(200).json({
    success: true,
    data: {
      totals: {
        ...totals,
        conversion: totals.views > 0 ? Number(((totals.bookings / totals.views) * 100).toFixed(1)) : 0,
      },
      trips: byTrip.sort((a, b) => b.views - a.views),
    },
  });
};

// GET /host-portal/me/overview — KPI aggregate for the dashboard.
export const getMyOverview = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;

  const trips = await Trips.find({ host: host._id }).select("_id Status enableBooking");
  const tripIds = trips.map((t) => String(t._id));
  const isLive = (t) =>
    (t.Status ?? "") === "approved" || (!t.Status && t.enableBooking);

  const [bookings, payouts] = await Promise.all([
    Bookings.find({ tripId: { $in: tripIds } }).select("total paymentStatus status DateOfBooking paymentDetail travellersCount"),
    Payout.find({ host: host._id }).select("amount status createdAt"),
  ]);

  // Revenue counts only paid, non-cancelled bookings (never pending/refunded/failed).
  const grossRevenue = earningRevenue(bookings);
  const paidOut = payouts
    .filter((p) => ["processed", "completed", "paid"].includes(String(p.status).toLowerCase()))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const pendingPayout = payouts
    .filter((p) => !["processed", "completed", "paid", "failed", "cancelled"].includes(String(p.status).toLowerCase()))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return res.status(200).json({
    success: true,
    data: {
      trips: {
        total: trips.length,
        active: trips.filter(isLive).length,
        pending: trips.filter((t) => ["pending", "changes_requested"].includes(t.Status ?? "")).length,
        rejected: trips.filter((t) => (t.Status ?? "") === "rejected").length,
      },
      bookings: {
        total: bookings.length,
        grossRevenue,
        // Monthly gross for the revenue chart (last 6 calendar months).
        byMonth: (() => {
          const out = [];
          const now = new Date();
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = d.toLocaleString("en-IN", { month: "short" });
            const value = bookings
              .filter((b) => {
                if (!isEarningBooking(b)) return false; // paid, non-cancelled only
                const bd = new Date(b.DateOfBooking);
                return !isNaN(bd) && bd.getFullYear() === d.getFullYear() && bd.getMonth() === d.getMonth();
              })
              .reduce((s, b) => s + (Number(b.total) || 0), 0);
            out.push({ month: label, value });
          }
          return out;
        })(),
        byStatus: {
          full: bookings.filter((b) => b.paymentStatus === "fullPayment").length,
          partial: bookings.filter((b) => b.paymentStatus === "firstPayment").length,
          other: bookings.filter((b) => !["fullPayment", "firstPayment"].includes(b.paymentStatus)).length,
        },
      },
      // Latest bookings for the Recent Activity table.
      recentActivity: bookings
        .slice()
        .sort((a, b) => new Date(b.DateOfBooking) - new Date(a.DateOfBooking))
        .slice(0, 5)
        .map((b) => {
          let title = "Trip";
          try { title = JSON.parse(b.paymentDetail || "{}")?.title || "Trip"; } catch { /* noop */ }
          return {
            trip: title,
            date: b.DateOfBooking,
            amount: Number(b.total) || 0,
            status: b.paymentStatus === "fullPayment" ? "Paid" : b.paymentStatus === "firstPayment" ? "Partial" : "Pending",
            travellers: Number(b.travellersCount) || 1,
          };
        }),
      payouts: { count: payouts.length, paidOut, pendingPayout },
    },
  });
};

// GET /host-portal/me/reviews — public (approved) reviews on this host or
// any of this host's trips.
export const getMyReviews = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const { UserReviews } = await import("../models/index.js");
  const trips = await Trips.find({ host: host._id }).select("_id");
  const tripIds = trips.map((t) => String(t._id));
  const reviews = await UserReviews.find({
    $or: [{ hostId: String(host._id) }, { tripId: { $in: tripIds } }],
    status: { $nin: ["pending", "rejected"] },
  }).sort({ date: -1 });
  return res.status(200).json({ success: true, data: reviews });
};

// POST /host-portal/me/enquiries/:id/read — clear the host's unread counter.
export const markEnquiryRead = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const enquiry = await Enquire.findOneAndUpdate(
    { _id: req.params.id, hostId: String(host._id) },
    { hostUnread: 0 },
    { new: true },
  );
  if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found." });
  return res.status(200).json({ success: true });
};
