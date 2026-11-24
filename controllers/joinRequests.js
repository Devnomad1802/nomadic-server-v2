import { TripApplication } from "../models/tripApplications.js";
import { Trips, User } from "../models/index.js";
import { Host } from "../models/hosts.js";
import { Notification } from "../models/notifications.js";
import { notifyHost } from "./hostPortal.js";
import {
  REAPPLY_FROM,
  canTransition,
  computeExpiry,
  DEFAULT_EXPIRY_HOURS,
  isApprovalLive,
} from "../services/approvalGate.js";

const CLIENT_URL = process.env.CLIENT_URL || "https://nomadictownies.com";

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */

// Resolve the Host record for the authenticated user (never a client-supplied
// id). Mirrors hostPortal.resolveHost.
async function resolveHostForUser(user) {
  if (!user) return null;
  let host = await Host.findOne({ user: user._id });
  if (!host && user.email) {
    host = await Host.findOne({ email: new RegExp(`^${String(user.email).trim()}$`, "i") });
  }
  return host;
}

// Host-facing projection — display name only, NEVER phone/email of the traveller.
function toHostView(app, nameById) {
  return {
    id: String(app._id),
    tripId: app.tripId,
    batchIndex: app.batchIndex,
    partySize: app.partySize,
    bookingOption: app.bookingOption || "",
    displayName: nameById.get(String(app.userId)) || "Traveller",
    answers: app.answers || {},
    status: app.status,
    expiresAt: app.expiresAt || null,
    decidedAt: app.decidedAt || null,
    createdAt: app.createdAt,
    audit: (app.audit || []).map((a) => ({ action: a.action, actorType: a.actorType, at: a.at, note: a.note })),
  };
}

// Customer-facing projection (their own application → full context + next action).
function toCustomerView(app, trip) {
  const live = isApprovalLive(app);
  let cta = null;
  switch (app.status) {
    case "pending": cta = "under_review"; break;
    case "call_scheduled": cta = "view_appointment"; break;
    case "approved": cta = live ? "book_now" : "expired"; break;
    case "declined": cta = "declined"; break;
    case "expired": cta = "request_renewal"; break;
    case "revoked": cta = "unavailable"; break;
    case "withdrawn": cta = "reapply"; break;
    case "booked": cta = "view_booking"; break;
    default: cta = null;
  }
  return {
    id: String(app._id),
    tripId: app.tripId,
    tripTitle: trip?.title || "",
    tripSlug: trip?.seoSlug || "",
    batchIndex: app.batchIndex,
    partySize: app.partySize,
    bookingOption: app.bookingOption || "",
    status: app.status,
    cta,
    expiresAt: app.expiresAt || null,
    createdAt: app.createdAt,
  };
}

/* ------------------------------------------------------------------ *
 *  Customer endpoints (JWT)
 * ------------------------------------------------------------------ */

// POST /join-requests/apply
export const applyToTrip = async (req, res) => {
  const user = req.user;
  if (!user?._id) return res.status(401).json({ success: false, message: "Login required." });

  const { tripId, batchIndex, partySize, bookingOption, answers } = req.body || {};
  if (!tripId) return res.status(400).json({ success: false, message: "tripId is required." });

  const trip = await Trips.findById(tripId).select("bookingMode host title enableBooking Status showOnWebsite");
  if (!trip) return res.status(404).json({ success: false, message: "Trip not found." });
  if (trip.bookingMode !== "approval") {
    return res.status(400).json({ success: false, message: "This trip accepts instant booking — no request needed.", code: "NOT_APPROVAL_MODE" });
  }
  if (!trip.host) {
    return res.status(409).json({ success: false, message: "This trip has no assigned host yet." });
  }

  const bIdx = Number(batchIndex) || 0;
  const pSize = Math.max(1, Number(partySize) || 1);

  // Dedupe: block a second active application; allow re-apply only from a closed state.
  const existing = await TripApplication.findOne({
    userId: String(user._id),
    tripId: String(tripId),
    batchIndex: bIdx,
  }).sort({ createdAt: -1 });

  if (existing && !REAPPLY_FROM.includes(existing.status)) {
    return res.status(409).json({
      success: false,
      message: "You already have an active request for this trip/batch.",
      code: "DUPLICATE_ACTIVE",
      status: existing.status,
    });
  }

  const now = new Date();
  let app;
  try {
    app = await TripApplication.create({
      userId: String(user._id),
      tripId: String(tripId),
      hostId: trip.host,
      batchIndex: bIdx,
      partySize: pSize,
      bookingOption: typeof bookingOption === "string" ? bookingOption.slice(0, 120) : "",
      answers: {
        motivation: String(answers?.motivation || "").slice(0, 1000),
        experience: String(answers?.experience || "").slice(0, 1000),
        availability: String(answers?.availability || "").slice(0, 1000),
      },
      status: "pending",
      audit: [{ action: "created", actorType: "customer", actorId: String(user._id), at: now }],
    });
  } catch (e) {
    // Unique partial index → a concurrent duplicate slipped through the check.
    if (e?.code === 11000) {
      return res.status(409).json({ success: false, message: "You already have an active request for this trip/batch.", code: "DUPLICATE_ACTIVE" });
    }
    throw e;
  }

  // Notify host (in-app, additive). Best-effort — never blocks the response.
  notifyHost(
    trip.host,
    "join_request",
    "New join request",
    `A traveller requested to join "${trip.title || "your trip"}".`,
    { tripId: String(tripId), applicationId: String(app._id), batchIndex: bIdx }
  );

  return res.status(201).json({ success: true, data: { id: String(app._id), status: app.status } });
};

// GET /join-requests/mine
export const myApplications = async (req, res) => {
  const user = req.user;
  if (!user?._id) return res.status(401).json({ success: false, message: "Login required." });

  const apps = await TripApplication.find({ userId: String(user._id) }).sort({ createdAt: -1 }).limit(100);
  const tripIds = [...new Set(apps.map((a) => a.tripId))];
  const trips = await Trips.find({ _id: { $in: tripIds } }).select("title seoSlug").lean();
  const tripById = new Map(trips.map((t) => [String(t._id), t]));

  return res.json({ success: true, data: apps.map((a) => toCustomerView(a, tripById.get(String(a.tripId)))) });
};

// POST /join-requests/:id/withdraw  (traveller withdraws their own request)
export const withdrawApplication = async (req, res) => {
  const user = req.user;
  if (!user?._id) return res.status(401).json({ success: false, message: "Login required." });

  const app = await TripApplication.findOne({ _id: req.params.id, userId: String(user._id) });
  if (!app) return res.status(404).json({ success: false, message: "Request not found." });
  if (!canTransition(app.status, "withdrawn")) {
    return res.status(409).json({ success: false, message: `Cannot withdraw a ${app.status} request.` });
  }
  app.status = "withdrawn";
  app.audit.push({ action: "withdrawn", actorType: "customer", actorId: String(user._id), at: new Date() });
  await app.save();
  return res.json({ success: true, data: { id: String(app._id), status: app.status } });
};

/* ------------------------------------------------------------------ *
 *  Host endpoints (JWT; mounted under /host-portal, host-scoped)
 * ------------------------------------------------------------------ */

async function requireHostCtx(req, res) {
  const host = await resolveHostForUser(req.user);
  if (!host) {
    res.status(404).json({ success: false, message: "No host profile is linked to this account." });
    return null;
  }
  if (host.dashboardAccess === false) {
    res.status(403).json({ success: false, message: "Dashboard access is disabled for this host." });
    return null;
  }
  return host;
}

// Load an application and assert it belongs to one of THIS host's requests.
// Ownership is enforced on hostId (set at creation from the trip's host), and
// re-checked against the live trip so a reassigned trip can't be acted on.
async function loadOwnedApplication(host, id, res) {
  const app = await TripApplication.findById(id);
  if (!app || String(app.hostId) !== String(host._id)) {
    res.status(404).json({ success: false, message: "Request not found." });
    return null;
  }
  return app;
}

// GET /host-portal/me/join-requests
export const hostListJoinRequests = async (req, res) => {
  const host = await requireHostCtx(req, res);
  if (!host) return;

  const { status, tripId, batchIndex, q, page = 1, limit = 20 } = req.query;
  const filter = { hostId: host._id };
  if (status && status !== "all") filter.status = status;
  if (tripId) filter.tripId = String(tripId);
  if (batchIndex !== undefined && batchIndex !== "") filter.batchIndex = Number(batchIndex) || 0;

  const lim = Math.min(50, Math.max(1, Number(limit) || 20));
  const skip = (Math.max(1, Number(page) || 1) - 1) * lim;

  const [rows, total] = await Promise.all([
    TripApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim),
    TripApplication.countDocuments(filter),
  ]);

  // Resolve display names (name only — never contact info).
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = await User.find({ _id: { $in: userIds } }).select("name").lean();
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));
  // Optional name search (server-side, on display name).
  let views = rows.map((r) => toHostView(r, nameById));
  if (q) {
    const needle = String(q).toLowerCase();
    views = views.filter((v) => v.displayName.toLowerCase().includes(needle));
  }

  // Real status counts for the tab badges (no hardcoded numbers).
  const countsAgg = await TripApplication.aggregate([
    { $match: { hostId: host._id } },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  const counts = countsAgg.reduce((acc, c) => { acc[c._id] = c.n; return acc; }, {});

  return res.json({ success: true, data: views, total, page: Number(page) || 1, limit: lim, counts });
};

// Shared decision handler (approve / decline / revoke).
async function hostDecision(req, res, action) {
  const host = await requireHostCtx(req, res);
  if (!host) return;
  const app = await loadOwnedApplication(host, req.params.id, res);
  if (!app) return;

  // Re-assert the trip is still assigned to this host (reassignment safety).
  const trip = await Trips.findById(app.tripId).select("host title seoSlug");
  if (!trip || String(trip.host) !== String(host._id)) {
    return res.status(403).json({ success: false, message: "This trip is no longer assigned to you." });
  }

  const target = action === "approve" ? "approved" : action === "decline" ? "declined" : "revoked";
  if (!canTransition(app.status, target)) {
    return res.status(409).json({ success: false, message: `Cannot ${action} a ${app.status} request.` });
  }

  const now = new Date();
  app.status = target;
  app.decidedAt = now;
  app.decidedByType = "host";
  app.decidedById = String(host._id);
  if (target === "approved") {
    app.expiresAt = computeExpiry(now, DEFAULT_EXPIRY_HOURS);
  }
  app.audit.push({ action: target, actorType: "host", actorId: String(host._id), at: now });
  await app.save();

  // Notify the traveller in-app (additive). Best-effort.
  try {
    const titleMap = { approved: "You're invited!", declined: "Request update", revoked: "Invitation withdrawn" };
    const bodyMap = {
      approved: `Your request to join "${trip.title}" was approved. Book within ${DEFAULT_EXPIRY_HOURS}h.`,
      declined: `Your request to join "${trip.title}" was not accepted this time.`,
      revoked: `Your invitation for "${trip.title}" is no longer available.`,
    };
    await Notification.create({
      recipientType: "user",
      recipientId: String(app.userId),
      type: `application_${target}`,
      title: titleMap[target],
      body: bodyMap[target],
      data: { tripId: app.tripId, applicationId: String(app._id), link: `${CLIENT_URL}/trips/${trip.seoSlug || app.tripId}` },
    });
  } catch (e) {
    console.error("notify traveller failed:", e?.message || e);
  }

  return res.json({ success: true, data: { id: String(app._id), status: app.status, expiresAt: app.expiresAt || null } });
}

export const hostApproveJoinRequest = (req, res) => hostDecision(req, res, "approve");
export const hostDeclineJoinRequest = (req, res) => hostDecision(req, res, "decline");
export const hostRevokeJoinRequest = (req, res) => hostDecision(req, res, "revoke");

/* ------------------------------------------------------------------ *
 *  Admin oversight (isAdmin)
 * ------------------------------------------------------------------ */

// GET /admin/join-requests
export const adminListJoinRequests = async (req, res) => {
  const { status, tripId, hostId, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status && status !== "all") filter.status = status;
  if (tripId) filter.tripId = String(tripId);
  if (hostId) filter.hostId = hostId;

  const lim = Math.min(100, Math.max(1, Number(limit) || 25));
  const skip = (Math.max(1, Number(page) || 1) - 1) * lim;

  const [rows, total] = await Promise.all([
    TripApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
    TripApplication.countDocuments(filter),
  ]);
  return res.json({ success: true, data: rows, total, page: Number(page) || 1, limit: lim });
};

// POST /admin/join-requests/:id/revoke  (audited override)
export const adminRevokeJoinRequest = async (req, res) => {
  const app = await TripApplication.findById(req.params.id);
  if (!app) return res.status(404).json({ success: false, message: "Request not found." });
  if (!canTransition(app.status, "revoked")) {
    return res.status(409).json({ success: false, message: `Cannot revoke a ${app.status} request.` });
  }
  const now = new Date();
  app.status = "revoked";
  app.decidedAt = now;
  app.decidedByType = "admin";
  app.decidedById = String(req.user?._id || "");
  app.audit.push({ action: "revoked", actorType: "admin", actorId: String(req.user?._id || ""), at: now, note: String(req.body?.note || "").slice(0, 300) });
  await app.save();
  return res.json({ success: true, data: { id: String(app._id), status: app.status } });
};
