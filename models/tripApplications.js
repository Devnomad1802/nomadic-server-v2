import mongoose from "mongoose";

/* TripApplication — a traveller's request to join an approval-required trip.
 *
 * Fully additive. Distinct from:
 *   - HostApplication  (the public "Become a Host" form)
 *   - Enquire          (trip enquiries / host<->traveller chat)
 *   - Bookings         (paid/confirmed bookings)
 *
 * Source of truth for account-bound booking authorization: the SERVER checks a
 * valid (approved, unexpired, in-scope) application before any payment order can
 * be created for an approval-mode trip. The emailed link is navigation only — it
 * carries no entitlement.
 *
 * States (see services/approvalGate.js for the allowed transitions):
 *   pending        — submitted, awaiting host decision
 *   call_scheduled — Phase 2 (introduction booked); still pre-decision
 *   approved       — host approved; bookable until expiresAt
 *   declined       — host declined; no booking access
 *   expired        — approval lapsed (expiresAt passed) before booking
 *   revoked        — approval withdrawn (host/admin, or auto on batch cancel /
 *                    trip hidden / host reassignment)
 *   withdrawn      — traveller withdrew their own application
 *   booked         — a booking was confirmed against this approval (terminal)
 */

const auditEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },   // created | approved | declined | revoked | expired | withdrawn | booked | renewed
    actorType: { type: String, required: true }, // host | admin | customer | system
    actorId: { type: String, required: false },  // Host._id / User._id / null for system
    at: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const tripApplicationSchema = new mongoose.Schema(
  {
    // ── Who / what (identity is the authenticated account; never trusted from body) ──
    userId: { type: String, required: true, index: true },      // User._id of the traveller
    tripId: { type: String, required: true, index: true },      // Trips._id
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: "Host", required: true, index: true },
    batchIndex: { type: Number, default: 0 },
    partySize: { type: Number, default: 1, min: 1 },
    // Optional booking option label (e.g. a section item Title) the traveller
    // intends to book. Stored for host context + scope check; NOT a price.
    bookingOption: { type: String, default: "" },

    // ── Application answers (fixed minimal set in Phase 1; admin-configurable later) ──
    answers: {
      motivation: { type: String, default: "" },
      experience: { type: String, default: "" },
      availability: { type: String, default: "" },
    },

    // ── State ──
    status: {
      type: String,
      enum: ["pending", "call_scheduled", "approved", "declined", "expired", "revoked", "withdrawn", "booked"],
      default: "pending",
      index: true,
    },
    // Set on approval; UTC instant. Approval is NOT a seat hold or price lock.
    expiresAt: { type: Date, required: false },
    decidedAt: { type: Date, required: false },
    decidedByType: { type: String, required: false }, // host | admin
    decidedById: { type: String, required: false },

    // Binds this approval to a single booking attempt (atomic consume). Once a
    // booking confirms, bookedBookingId is stamped and status → booked so the
    // same approval can never be spent twice.
    bookedBookingId: { type: String, required: false },

    // Append-only audit trail.
    audit: { type: [auditEntrySchema], default: [] },
  },
  { timestamps: true }
);

// Fast host-side queries (Join Requests list: by host, trip, batch, status, newest first).
tripApplicationSchema.index({ hostId: 1, status: 1, createdAt: -1 });
tripApplicationSchema.index({ tripId: 1, batchIndex: 1, status: 1 });
// Customer "My Applications".
tripApplicationSchema.index({ userId: 1, createdAt: -1 });

// At most ONE active application per (user, trip, batch). "Active" = not in a
// terminal/closed state. Partial unique index so re-applying after
// declined/expired/revoked/withdrawn is allowed (those rows are excluded).
tripApplicationSchema.index(
  { userId: 1, tripId: 1, batchIndex: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "call_scheduled", "approved", "booked"] },
    },
    name: "one_active_application_per_user_trip_batch",
  }
);

export const TripApplication = mongoose.model("TripApplication", tripApplicationSchema);
