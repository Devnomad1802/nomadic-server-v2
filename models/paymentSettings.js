import mongoose from "mongoose";

/**
 * PaymentSettings — single source of truth for Payment Maintenance Mode.
 *
 * ONE document for the whole platform (keyed by `key: "payment"`), so every
 * backend instance reads the same state from the DB (never frontend
 * localStorage). While `paymentMaintenance` is ON, the server payment gate
 * denies new Razorpay payment initiation for ordinary customers; browsing,
 * login, and booking preparation stay available.
 *
 * Defaults are deliberately SAFE: maintenance ON. Payments are only ever
 * enabled when an authorized admin deliberately turns this OFF after verified
 * live readiness — never implicitly, and never because config is missing.
 *
 * Secrets (Razorpay keys, webhook secrets) are NEVER stored here; readiness is
 * derived from environment at read time and exposed only as booleans.
 */
const auditEntrySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: String, default: "" },      // admin user id
    byEmail: { type: String, default: "" },  // admin email (for the readable log)
    action: { type: String, default: "" },   // e.g. "maintenance_on", "update_whatsapp"
    detail: { type: String, default: "" },    // short human description, no secrets
  },
  { _id: false }
);

const paymentSettingsSchema = new mongoose.Schema(
  {
    // Singleton key — exactly one settings doc. Unique so concurrent creates
    // collapse to one record.
    key: { type: String, default: "payment", unique: true, index: true },

    // Main switch. Default ON (safe): no online payments until deliberately
    // enabled after verified live integration.
    paymentMaintenance: { type: Boolean, default: true },

    // Verified official WhatsApp business number in E.164 (e.g. "+9198...").
    // Empty until an admin sets a validated number; the client shows a safe
    // fallback while empty rather than a broken link.
    whatsappNumber: { type: String, default: "" },

    // Customer-facing copy (escaped/sanitised on input). Safe defaults below.
    noticeHeading: { type: String, default: "Online payments are temporarily unavailable" },
    noticeBody: {
      type: String,
      default:
        "We're currently updating our secure payment system. You can still explore our experiences and plan your trip. To enquire about this trip or get help with your booking, chat with the Nomadic Townies team on WhatsApp. This is an enquiry, not a confirmed booking.",
    },
    noticeCtaLabel: { type: String, default: "Enquire on WhatsApp" },

    // Last-updater diagnostics (no secrets).
    updatedByEmail: { type: String, default: "" },
    updatedById: { type: String, default: "" },

    // Append-only audit trail (capped at the most recent 100 entries).
    auditLog: { type: [auditEntrySchema], default: [] },
  },
  { timestamps: true, minimize: false }
);

export const PaymentSettings = mongoose.model("PaymentSettings", paymentSettingsSchema);
