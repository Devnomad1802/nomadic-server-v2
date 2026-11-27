import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  userId: { type: String, required: false },
  bookingId: { type: String, required: false },
  paymentDetail: { type: String, required: false },
  cardData: { type: String, required: false },
  total: { type: Number, required: false },
  tripId: { type: String, required: false },
  paymentStatus: { type: String, required: false },
  userName: { type: String, required: false },
  coupenDiscount: { type: String, require: false },
  // noOfTravlers: { type: String, required: false },
  // NoOfDays: { type: String, required: false },
  email: { type: String, required: false },
  phone: { type: String, required: false },
  status: { type: String, required: false },
  type: { type: String, required: false },
  // paymentStatus: { type: String, required: false },
  // packagePricePerHead: { type: String, required: false },
  // Amount: { type: String, required: false },
  // gst: { type: String, required: false },
  // discount: { type: String, required: false },
  // totalAmount: { type: String, required: false },
  // dropOf: { type: String, required: false },
  // tripStartDate: { type: Date, required: false },
  // tripEndDate: { type: Date, required: false },
  DateOfBooking: { type: Date, required: false },
  // tripName: { type: String, required: false },

  // ── Structured booking details (new booking flow) ──
  travellers: [
    {
      name: { type: String, required: false },
      age: { type: String, required: false },
      gender: { type: String, required: false },
      phone: { type: String, required: false },
      email: { type: String, required: false },
      city: { type: String, required: false },
      isLead: { type: Boolean, default: false },
    },
  ],
  emergencyContact: {
    name: { type: String, required: false },
    phone: { type: String, required: false },
    relation: { type: String, required: false },
  },
  dietary: { type: String, required: false },
  batchDate: { type: String, required: false },
  roomType: { type: String, required: false },
  couponCode: { type: String, required: false },

  // ── Secure payment flow (C1/C2) — required for createSecureOrder/confirmBooking ──
  razorpayOrderId: { type: String, required: false },
  razorpayPaymentId: { type: String, required: false },
  orderAmount: { type: Number, required: false },   // amount charged this transaction
  fullTripAmount: { type: Number, required: false }, // full price of the trip
  batchIndex: { type: Number, required: false },
  travellersCount: { type: Number, required: false },
  paymentType: { type: String, required: false },    // "full" | "firstPayment"
  // Razorpay environment this booking's order was created against. "live" for
  // real customer bookings; "test" only for the authorized sandbox account in a
  // non-production/staging environment. Lets confirm pick the right secret and
  // keeps test records isolated from genuine revenue/reporting.
  mode: { type: String, enum: ["live", "test"], default: "live", index: true },

  // ── Invoice (assigned once, after the first verified payment) ──
  invoiceNumber: { type: String, required: false },
  invoiceDate: { type: Date, required: false },

  // ── Balance top-up (paying remaining of a firstPayment booking) ──
  balanceOrderId: { type: String, required: false },
  balanceAmount: { type: Number, required: false },

  payoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', required: false },

  // ── Booking origin / assisted-booking provenance (additive, back-compat) ──
  // Where this booking came from. Legacy + website rows have no value →
  // treated as "website". "admin_assisted" = created by staff via a payment
  // link; "imported" = an already-captured Razorpay payment attached by an
  // admin (no new charge). Defaulting is intentional: NOT required, so every
  // existing row keeps working unchanged.
  source: { type: String, enum: ["website", "admin_assisted", "imported"], required: false },
  // Admin actor who created an assisted/imported booking (audit trail).
  assistedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  // When an existing payment was imported (audit timestamp), kept SEPARATE from
  // the original payment time (DateOfBooking preserves the real capture date).
  importedAt: { type: Date, required: false },
  // Razorpay Payment Link provenance (assisted flow) — persisted when a link is
  // generated server-side so status/reconcile never guesses.
  paymentLinkId: { type: String, required: false },
  paymentLinkShortUrl: { type: String, required: false },
  // Razorpay payment-link lifecycle: created | paid | partially_paid | cancelled | expired.
  paymentLinkStatus: { type: String, required: false },
  // Set when invoice issuance was BLOCKED at finalize time because the booking
  // snapshot did not reconcile (empty line items, or subtotal+GST ≠ grand total).
  // The payment still stands; no FY invoice number is consumed. Ops review needed.
  invoiceBlockedReason: { type: String, required: false },
});

userSchema.index({ razorpayOrderId: 1 }, { sparse: true });
userSchema.index({ balanceOrderId: 1 }, { sparse: true });
// Dedupe/lookup index for imported & assisted payments. NON-UNIQUE for now:
// a UNIQUE constraint is deferred until a read-only dry-run
// (scripts/import-dedupe-dryrun.mjs) confirms the production collection has no
// existing duplicate razorpayPaymentId values. Application-level dedupe in
// controllers/importPayment.js guards duplicate allocation in the meantime.
userSchema.index({ razorpayPaymentId: 1 }, { sparse: true });

export const Bookings = mongoose.model("Bookings", userSchema);
