import mongoose from "mongoose";

/**
 * Booking Add-ons Engine — one generic catalogue for every optional booking
 * service. Travel Insurance is the first `type`; airport pickup, gear rental,
 * eSIM etc. are just more documents of the same shape. The UI renders the
 * shape, never the specific service, so new services need no UI redesign.
 *
 * Pricing is authoritative here: the server reads plan prices from this
 * collection when building the secure Razorpay order — the browser only sends
 * WHICH add-on/plan was chosen, never the amount.
 */
const planSchema = new mongoose.Schema(
  {
    planId: { type: String, required: true }, // stable id used by the client
    label: { type: String, required: true }, // "Standard" | "Adventure" | …
    summary: { type: String, default: "" }, // one-line description
    price: { type: Number, required: true }, // ₹, per booking (flat) — server-trusted
    coverage: { type: [String], default: [] }, // bullet points shown in the UI
  },
  { _id: false }
);

const addonSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // "insurance" | "pickup" | "gear" | …
    title: { type: String, required: true },
    tagline: { type: String, default: "" },
    icon: { type: String, default: "shield" }, // keyword mapped to a client icon
    provider: {
      name: { type: String, default: "" },
      verified: { type: Boolean, default: false },
    },
    features: { type: [String], default: [] }, // chips: "Instant policy", "Easy claims"…
    // Eligibility scope. Empty scope = available on every trip. Any populated
    // filter narrows it (OR within a field, AND across fields when present).
    scope: {
      tripIds: { type: [String], default: [] },
      categories: { type: [String], default: [] },
      regions: { type: [String], default: [] },
      countries: { type: [String], default: [] },
    },
    plans: { type: [planSchema], default: [] },
    selection: { type: String, enum: ["single", "multi"], default: "single" },
    // Purchasable up to N hours before departure (post-booking reminder window).
    availableUntilHoursBeforeDeparture: { type: Number, default: 48 },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Addon = mongoose.model("Addon", addonSchema);
