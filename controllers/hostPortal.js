import { Host } from "../models/hosts.js";
import { Trips } from "../models/trips.js";
import { Bookings } from "../models/bookings.js";
import { Enquire } from "../models/enquire.js";
import Payout from "../models/payouts.js";

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
