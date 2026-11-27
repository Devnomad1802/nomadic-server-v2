import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  Phone: { type: String, required: false },
  Email: { type: String, required: false },
  Name: { type: String, required: false },
  Message: { type: String, required: false },
  Reply: { type: String, required: false },
  userId: { type: String, required: false },
  // Optional trip/host linkage (Host Dashboard). Additive — legacy enquiries
  // without these fields remain admin-only.
  tripId: { type: String, required: false },
  hostId: { type: String, required: false },
  status: { type: String, required: false },
  // ── Booking-enquiry fallback (Phase B) ──
  // Set when an enquiry comes from the checkout fallback. Non-sensitive context
  // only (trip name/batch/party size) — never PII beyond contact, no payment data.
  source: { type: String, required: false },     // e.g. "booking_fallback"
  tripName: { type: String, required: false },
  batchInfo: { type: String, required: false },   // human-readable dates
  partySize: { type: Number, required: false },
  // Short hash of (contact|trip|message) to collapse accidental double-submits.
  dedupeKey: { type: String, required: false, index: true },
  Date: { type: Date, required: false },
  // ── Platform chat (host <-> traveller) ──
  // Unread counters per side + contact-sharing moderation state.
  hostUnread: { type: Number, default: 0 },
  userUnread: { type: Number, default: 0 },
  moderation: {
    violations: { type: Number, default: 0 },
    pausedUntil: { type: Date, default: null },
  },
  chat: [
    {
      MessageBy: {
        type: String,
        required: false,
      },
      Message: {
        type: String,
        required: false,
      },
      timeStamp: {
        // Must be a function, not a value. `new Date(...)` here would be
        // evaluated once at model-load and freeze every auto-defaulted
        // timestamp to server boot time, scrambling chat chronology.
        type: Date,
        default: Date.now,
      },
      // ── Email notification status (additive; tracked SEPARATELY from chat
      // state). Recipient stored MASKED. status: sent|failed|unavailable|
      // unknown|delivered|bounced. ──
      notify: {
        to: { type: String },        // recipient role: "host" | "user"
        email: { type: String },     // MASKED recipient (never the raw address)
        status: { type: String },
        providerId: { type: String },
        attempts: { type: Number, default: 0 },
        error: { type: String },
        at: { type: Date },
      },
      // ── Edit / delete audit trail (additive; legacy messages have none) ──
      edited: { type: Boolean, default: false },
      editedAt: { type: Date, default: null },
      // Soft delete only — content moves to history, Message replaced by
      // placeholder for participant APIs; admins keep the original via history.
      deleted: { type: Boolean, default: false },
      deletedAt: { type: Date, default: null },
      deletedBy: { type: String, default: null }, // "host" | "admin"
      // Immutable prior versions (admin/forensic only, never sent to participants).
      history: [
        {
          Message: { type: String },
          editorRole: { type: String }, // "host" | "admin"
          at: { type: Date, default: Date.now },
          action: { type: String }, // "edit" | "delete"
        },
      ],
    },
  ],
});

export const Enquire = mongoose.model("Enquire", userSchema);
