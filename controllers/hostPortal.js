import crypto from "crypto";
import { Resend } from "resend";
import { uploadFilesToS3 } from "../middlewares/index.js";
import { Host } from "../models/hosts.js";
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
  return res.status(200).json({ success: true, data: enquiries });
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
  if (host.user) {
    return res.status(409).json({ success: false, message: "Host already has a linked login account." });
  }
  if (!host.emailAddress) {
    return res.status(400).json({ success: false, message: "Host has no email address." });
  }

  // Link an existing User with this email, or create a fresh one.
  let user = await User.findOne({
    email: { $regex: `^${host.emailAddress}$`, $options: "i" },
  });
  let tempPassword = null;

  if (user) {
    if (String(user.role).toLowerCase() !== "admin") {
      user.role = "Host";
      await user.save();
    }
  } else {
    tempPassword = crypto.randomBytes(9).toString("base64url"); // ~12 chars
    user = await new User({
      name: host.hostTitle || host.hostName || "Host",
      email: host.emailAddress,
      password: tempPassword, // hashed by the User pre-save hook
      role: "Host",
      isVerified: true,
    }).save();
  }

  host.user = user._id;
  host.status = "approved";
  host.isVerified = true;
  await host.save();

  await notifyHost(
    host._id,
    "account",
    "Welcome to your Host Dashboard",
    "Your host account has been approved and your dashboard login is active."
  );

  // Email credentials / welcome. Failure is non-fatal: the admin gets the
  // temp password back in the response to share manually.
  let emailSent = false;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const sent = await resend.emails.send({
      from: "Nomadic Townies <noreply@nomadictownies.com>",
      to: host.emailAddress,
      subject: "Your Nomadic Townies Host Dashboard is ready",
      html: `
        <p>Hi ${host.hostTitle || host.hostName},</p>
        <p>Your host application has been approved. You can now sign in to your Host Dashboard.</p>
        <p><b>Email:</b> ${host.emailAddress}<br/>
        ${tempPassword ? `<b>Temporary password:</b> ${tempPassword}<br/>` : "Use your existing account password.<br/>"}
        </p>
        <p>Please change your password after your first login.</p>
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
    message: `Host activated${emailSent ? " and credentials emailed" : " (email failed — share credentials manually)"}.`,
    data: {
      hostId: host._id,
      userId: user._id,
      email: host.emailAddress,
      emailSent,
      // Only returned when a new account was created AND the email failed,
      // so the admin can pass credentials on manually.
      ...(tempPassword && !emailSent ? { tempPassword } : {}),
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
  const { message } = req.body;
  if (!message || !String(message).trim()) {
    return res.status(400).json({ success: false, message: "Message is required." });
  }
  const enquiry = await Enquire.findOne({ _id: req.params.id, hostId: String(host._id) });
  if (!enquiry) {
    return res.status(404).json({ success: false, message: "Enquiry not found." });
  }
  enquiry.chat = enquiry.chat || [];
  enquiry.chat.push({ MessageBy: "host", Message: String(message), timeStamp: new Date() });
  enquiry.Reply = String(message);
  enquiry.status = "Replied";
  await enquiry.save();
  return res.status(200).json({ success: true, data: enquiry });
};

// PUT /host-portal/me/trips/:id — host edits their OWN trip and resubmits.
// Any edit returns the trip to "pending" for admin re-review. Text fields
// only (images unchanged); Status/host cannot be set by the host.
const HOST_EDITABLE_TRIP_FIELDS = [
  "title", "subTitle", "days", "nights", "location", "pickUp", "dropOff",
  "categories", "overview", "type", "price", "strikePrice", "commissionRate",
  "firstBookingPrice", "Inclusion", "Exclusion", "ThingsToCarry", "Cancellation",
  "highlights", "numberOfDays", "numberOfSeats", "selectDate", "endSelectDate",
  "addDays", "addsection", "tripOff", "metaDescription", "seoSlug", "seoTitle",
];
export const updateMyTrip = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;
  const trip = await Trips.findOne({ _id: req.params.id, host: host._id });
  if (!trip) {
    return res.status(404).json({ success: false, message: "Trip not found." });
  }
  for (const k of HOST_EDITABLE_TRIP_FIELDS) {
    if (req.body[k] !== undefined) trip[k] = req.body[k];
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

// GET /host-portal/me/analytics — per-trip views/bookings/revenue + totals.
export const getMyAnalytics = async (req, res) => {
  const host = await requireHost(req, res);
  if (!host) return;

  const trips = await Trips.find({ host: host._id }).select("_id title viewCount Status enableBooking");
  const tripIds = trips.map((t) => String(t._id));
  const bookings = await Bookings.find({ tripId: { $in: tripIds } }).select("tripId total");

  const byTrip = trips.map((t) => {
    const b = bookings.filter((x) => x.tripId === String(t._id));
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
    Bookings.find({ tripId: { $in: tripIds } }).select("total paymentStatus status DateOfBooking"),
    Payout.find({ host: host._id }).select("amount status createdAt"),
  ]);

  const grossRevenue = bookings.reduce((s, b) => s + (Number(b.total) || 0), 0);
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
      bookings: { total: bookings.length, grossRevenue },
      payouts: { count: payouts.length, paidOut, pendingPayout },
    },
  });
};
