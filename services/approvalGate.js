import { TripApplication } from "../models/tripApplications.js";

/* Approval gate — server-side source of truth for approval-required trips.
 *
 * Pure helpers (state machine) are exported for unit testing; the DB-touching
 * helpers enforce authorization at payment-order creation and consume an
 * approval atomically when a booking confirms.
 *
 * NOTHING here touches pricing, GST, commission, seats or payouts — those stay
 * with the existing authoritative calculations. Approval alone is not revenue,
 * a seat hold, a price lock, or a booking confirmation.
 */

export const DEFAULT_EXPIRY_HOURS = 48;

export const ACTIVE_STATES = ["pending", "call_scheduled", "approved", "booked"];
export const TERMINAL_STATES = ["declined", "expired", "revoked", "withdrawn", "booked"];
// A traveller may submit a fresh application only from these closed states.
export const REAPPLY_FROM = ["declined", "expired", "revoked", "withdrawn"];

/** Allowed state transitions. Any pair not listed is rejected. */
const TRANSITIONS = {
  pending: ["call_scheduled", "approved", "declined", "revoked", "withdrawn", "expired"],
  call_scheduled: ["approved", "declined", "revoked", "withdrawn", "expired"],
  approved: ["booked", "revoked", "expired"],
  declined: [],
  expired: [],
  revoked: [],
  withdrawn: [],
  booked: [],
};

export function canTransition(from, to) {
  if (from === to) return false;
  return !!TRANSITIONS[from]?.includes(to);
}

/** True when an approved application is still within its validity window. */
export function isApprovalLive(app, now = new Date()) {
  if (!app || app.status !== "approved") return false;
  if (!app.expiresAt) return false;
  return new Date(app.expiresAt).getTime() > now.getTime();
}

/** Compute an expiry instant (UTC) from an approval time. */
export function computeExpiry(fromDate = new Date(), hours = DEFAULT_EXPIRY_HOURS) {
  return new Date(fromDate.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Scope check: an approval authorizes only the batch it was granted for and up
 * to the approved party size. A larger party or a different batch needs a new
 * approval. bookingOption is advisory (host context), not enforced as scope in
 * Phase 1 beyond what the booking amount already derives server-side.
 */
export function withinScope(app, { batchIndex, partySize }) {
  if (!app) return false;
  if (Number(app.batchIndex || 0) !== Number(batchIndex || 0)) return false;
  if (Number(partySize || 0) > Number(app.partySize || 0)) return false;
  return true;
}

/**
 * requireValidApproval — call inside any payment-order-creation path for an
 * approval-mode trip. Returns { ok } or { ok:false, status, code, message }.
 *
 * Lazily expires a stale approved row (approved but past expiresAt) so a single
 * missed cron never leaves a usable-looking window open.
 *
 * Identity MUST come from the authenticated session (pass req.user._id), never
 * the request body.
 */
export async function requireValidApproval({ userId, tripId, batchIndex, partySize }) {
  if (!userId) return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Login required." };

  const app = await TripApplication.findOne({
    userId: String(userId),
    tripId: String(tripId),
    status: { $in: ["approved", "booked"] },
  }).sort({ createdAt: -1 });

  if (!app) {
    return { ok: false, status: 403, code: "APPROVAL_REQUIRED", message: "This trip requires host approval. Request to join first." };
  }

  // Already consumed.
  if (app.status === "booked") {
    return { ok: false, status: 409, code: "APPROVAL_ALREADY_USED", message: "This invitation has already been used for a booking." };
  }

  // Lazily expire.
  if (!isApprovalLive(app)) {
    if (app.status === "approved") {
      app.status = "expired";
      app.audit.push({ action: "expired", actorType: "system", at: new Date(), note: "lazy-expire at order creation" });
      await app.save().catch(() => {});
    }
    return { ok: false, status: 403, code: "APPROVAL_EXPIRED", message: "Your invitation has expired. Request renewal if still interested." };
  }

  if (!withinScope(app, { batchIndex, partySize })) {
    return { ok: false, status: 403, code: "APPROVAL_SCOPE", message: "Your invitation does not cover this batch or party size. A new request is needed." };
  }

  return { ok: true, application: app };
}

/**
 * consumeApprovalForBooking — atomically bind an approval to a confirmed
 * booking. Idempotent: if this booking already consumed it, returns ok. Prevents
 * two parallel bookings spending the same approval (conditional update on the
 * live-approved row).
 */
export async function consumeApprovalForBooking({ userId, tripId, bookingId }) {
  // Idempotent: already bound to THIS booking.
  const already = await TripApplication.findOne({ userId: String(userId), tripId: String(tripId), bookedBookingId: String(bookingId) });
  if (already) return { ok: true, application: already };

  const now = new Date();
  const updated = await TripApplication.findOneAndUpdate(
    {
      userId: String(userId),
      tripId: String(tripId),
      status: "approved",
      expiresAt: { $gt: now },
      bookedBookingId: { $in: [null, undefined] },
    },
    {
      $set: { status: "booked", bookedBookingId: String(bookingId) },
      $push: { audit: { action: "booked", actorType: "system", at: now, note: `booking ${bookingId}` } },
    },
    { new: true }
  );

  if (!updated) return { ok: false, code: "NO_LIVE_APPROVAL" };
  return { ok: true, application: updated };
}
