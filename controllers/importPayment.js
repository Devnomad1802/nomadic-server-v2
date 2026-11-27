// ─────────────────────────────────────────────────────────────
// Import Existing Payment (Admin-only) — directive §5
//
// Attach an ALREADY-CAPTURED Razorpay payment (or payment link) to a booking,
// WITHOUT creating a new charge. The server fetches the AUTHORITATIVE payment
// state from Razorpay (never a client flag), verifies it is captured / not
// refunded / not already allocated / amount matches, then confirms exactly ONCE
// through the shared finalizeBookingPaid() — same invoice + email path as a
// website booking. A dry-run preview is provided before any write.
//
// Safety invariants (see NT_ASSISTED_BOOKINGS_PHASE1_AUDIT.md):
//   • No new charge is ever created here.
//   • Test payments are naturally excluded: we fetch with LIVE keys, so a test
//     payment id simply isn't found.
//   • Duplicate allocation is blocked (application-level dedupe on
//     razorpayPaymentId; a DB unique index follows after the dry-run).
//   • An amount mismatch is NEVER forced into a fully-paid booking — it is
//     returned for review instead of confirmed.
// ─────────────────────────────────────────────────────────────
import Razorpay from "razorpay";
import { Bookings, Trips, User } from "../models/index.js";
import { keysForMode } from "../services/paymentAvailability.js";
import { computeTripAmount, finalizeBookingPaid } from "./Order.js";

// ── Pure helpers (exported for unit tests; no DB, no network) ─────────────────

/** Mask an email for display: j***n@example.com → never reveal the full local part. */
export const maskEmail = (email) => {
  const s = String(email || "");
  const at = s.indexOf("@");
  if (at <= 0) return s ? "***" : "";
  const local = s.slice(0, at);
  const domain = s.slice(at);
  const head = local.slice(0, 1);
  return `${head}***${domain}`;
};

/** Mask a phone for display: keep last 2 digits only. */
export const maskPhone = (phone) => {
  const s = String(phone || "").replace(/\s+/g, "");
  if (s.length <= 2) return s ? "***" : "";
  return `${"*".repeat(Math.max(2, s.length - 2))}${s.slice(-2)}`;
};

/**
 * Is a fetched Razorpay payment eligible to import for a NORMAL confirmation?
 * Rejects uncaptured, non-INR, and fully-refunded payments. Exceptional cases
 * (partial refund, dispute) are routed to review, not auto-confirmed.
 * @param payment Razorpay payment object (amounts in paise)
 */
export const classifyImportPayment = (payment) => {
  const status = String(payment?.status || "").toLowerCase();
  const currency = String(payment?.currency || "").toUpperCase();
  const amount = Number(payment?.amount || 0);
  const refunded = Number(payment?.amount_refunded || 0);

  if (!payment || !payment.id) return { ok: false, code: "NOT_FOUND", message: "Payment not found" };
  if (status !== "captured") return { ok: false, code: "NOT_CAPTURED", message: `Payment is '${status}', not captured` };
  if (currency && currency !== "INR") return { ok: false, code: "CURRENCY", message: `Unsupported currency ${currency}` };
  if (amount > 0 && refunded >= amount) return { ok: false, code: "REFUNDED", message: "Payment fully refunded" };
  if (refunded > 0) return { ok: false, code: "PARTIAL_REFUND", message: "Payment partially refunded — route to review" };
  return { ok: true };
};

/**
 * Decide the booking payment type from received vs expected (all RUPEES).
 * Exact full → "full"; exact advance → "firstPayment"; anything else → mismatch
 * (NEVER auto-confirmed). Returns { match, paymentType|null }.
 */
export const matchImportAmount = (receivedRupees, fullRupees, firstRupees) => {
  const r = Math.round(Number(receivedRupees) || 0);
  const full = Math.round(Number(fullRupees) || 0);
  const first = Math.round(Number(firstRupees) || 0);
  if (full > 0 && r === full) return { match: "full", paymentType: "full" };
  if (first > 0 && r === first && first < full) return { match: "partial", paymentType: "firstPayment" };
  if (full > 0 && r > full) return { match: "excess", paymentType: null };
  return { match: "mismatch", paymentType: null };
};

// ── Authoritative fetch (network) ────────────────────────────────────────────

const liveRazorpay = () => {
  const keys = keysForMode("live");
  if (!keys.key_id || !keys.key_secret) return null;
  return new Razorpay({ key_id: keys.key_id, key_secret: keys.key_secret });
};

/**
 * Resolve the caller's reference to a single authoritative captured payment.
 * Accepts a payment id (pay_…) directly, or a payment link id (plink_…) whose
 * captured payment is enumerated. Returns { ok, payment } or { ok:false,... }.
 */
const resolvePayment = async (rzp, { paymentId, paymentLinkId }) => {
  try {
    if (paymentId) {
      const payment = await rzp.payments.fetch(String(paymentId));
      return { ok: true, payment };
    }
    if (paymentLinkId) {
      const link = await rzp.paymentLink.fetch(String(paymentLinkId));
      const payments = Array.isArray(link?.payments) ? link.payments : [];
      const captured = payments.find((p) => String(p?.status).toLowerCase() === "captured");
      if (!captured?.payment_id && !captured?.plink_payment_id) {
        return { ok: false, code: "LINK_UNPAID", message: "No captured payment on this link" };
      }
      const payId = captured.payment_id || captured.plink_payment_id;
      const payment = await rzp.payments.fetch(String(payId));
      return { ok: true, payment };
    }
    return { ok: false, code: "NO_REF", message: "Provide a paymentId or paymentLinkId" };
  } catch (e) {
    // A test-mode id (or a typo) is simply not found with live keys.
    return { ok: false, code: "FETCH_FAILED", message: e?.error?.description || e?.message || "Could not fetch payment" };
  }
};

/** Has this payment id already been attached to any booking? (dedupe) */
const existingAllocation = async (paymentId) =>
  Bookings.findOne({ razorpayPaymentId: String(paymentId) }).select("_id bookingId source").lean();

// ── POST /api/admin/import-payment/preview  (admin) ──────────────────────────
// Dry-run: fetch authoritative evidence, masked. NO DB write. Shows
// expected-vs-received once a trip/selection is supplied.
export const previewImportPayment = async (req, res) => {
  try {
    const rzp = liveRazorpay();
    if (!rzp) return res.status(500).json({ error: "Razorpay live credentials not configured" });

    const { paymentId, paymentLinkId, tripId, quantities, couponCode } = req.body || {};
    const resolved = await resolvePayment(rzp, { paymentId, paymentLinkId });
    if (!resolved.ok) return res.status(404).json({ error: resolved.message, code: resolved.code });

    const payment = resolved.payment;
    const eligibility = classifyImportPayment(payment);
    const already = await existingAllocation(payment.id);

    // Expected amount is optional at preview time (admin may not have picked a
    // trip yet). When a trip + selection is supplied, show expected-vs-received.
    let expected = null;
    if (tripId) {
      const trip = await Trips.findById(tripId).lean();
      if (trip) {
        const calc = computeTripAmount(trip, quantities, couponCode);
        const firstPrice = Math.round(Number(trip.firstBookingPrice) || 0);
        const receivedRupees = Number(payment.amount || 0) / 100;
        const amt = matchImportAmount(receivedRupees, calc.total, firstPrice);
        expected = {
          fullAmount: calc.total,
          firstPaymentAmount: firstPrice || null,
          receivedAmount: receivedRupees,
          match: amt.match,
          paymentType: amt.paymentType,
          remainingBalance: amt.paymentType === "firstPayment" ? Math.max(0, calc.total - receivedRupees) : 0,
        };
      }
    }

    return res.json({
      evidence: {
        paymentId: payment.id,
        status: payment.status,
        amount: Number(payment.amount || 0) / 100,
        currency: payment.currency,
        capturedAt: payment.created_at ? new Date(payment.created_at * 1000).toISOString() : null,
        method: payment.method || null,
        amountRefunded: Number(payment.amount_refunded || 0) / 100,
        contactEmail: maskEmail(payment.email),
        contactPhone: maskPhone(payment.contact),
      },
      eligible: eligibility.ok,
      eligibilityReason: eligibility.ok ? null : eligibility.message,
      eligibilityCode: eligibility.ok ? null : eligibility.code,
      alreadyAllocated: !!already,
      alreadyAllocatedTo: already ? { bookingId: already.bookingId, source: already.source } : null,
      expected, // null until a trip + selection is supplied
    });
  } catch (error) {
    console.error("previewImportPayment error:", error?.message || error);
    return res.status(500).json({ error: "Could not preview payment" });
  }
};

// ── POST /api/admin/import-payment/confirm  (admin) ──────────────────────────
// Verify authoritative state again, assert eligible + not allocated + amount
// matches, create an "imported" booking, and finalize ONCE (invoice + email via
// the shared path). Never creates a charge.
export const confirmImportPayment = async (req, res) => {
  try {
    const adminId = req.user?._id;
    const rzp = liveRazorpay();
    if (!rzp) return res.status(500).json({ error: "Razorpay live credentials not configured" });

    const { paymentId, paymentLinkId, userId, tripId, batchIndex, quantities, couponCode, travellers } = req.body || {};
    if (!userId || !tripId) return res.status(400).json({ error: "userId (customer) and tripId are required" });

    // Re-fetch authoritative state at confirm time (don't trust the preview).
    const resolved = await resolvePayment(rzp, { paymentId, paymentLinkId });
    if (!resolved.ok) return res.status(404).json({ error: resolved.message, code: resolved.code });
    const payment = resolved.payment;

    const eligibility = classifyImportPayment(payment);
    if (!eligibility.ok) return res.status(422).json({ error: eligibility.message, code: eligibility.code });

    // Dedupe: never allocate the same payment twice.
    const already = await existingAllocation(payment.id);
    if (already) {
      return res.status(409).json({ error: "This payment is already allocated to a booking", code: "ALREADY_ALLOCATED", bookingId: already.bookingId });
    }

    const [customer, trip] = await Promise.all([
      User.findById(userId).select("name email phone role").lean(),
      Trips.findById(tripId).lean(),
    ]);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    const calc = computeTripAmount(trip, quantities, couponCode);
    if (calc.total <= 0 || calc.travellers <= 0) {
      return res.status(400).json({ error: "Invalid selection — choose at least one traveller/category." });
    }
    const firstPrice = Math.round(Number(trip.firstBookingPrice) || 0);
    const receivedRupees = Number(payment.amount || 0) / 100;
    const amt = matchImportAmount(receivedRupees, calc.total, firstPrice);
    if (!amt.paymentType) {
      // Mismatch / excess — do NOT force into a paid booking. Route to review.
      return res.status(409).json({
        error: "Amount does not match the selected trip — needs reconciliation, not auto-confirm",
        code: "AMOUNT_MISMATCH",
        expected: { fullAmount: calc.total, firstPaymentAmount: firstPrice || null },
        received: receivedRupees,
        match: amt.match,
      });
    }

    // Build the booking as an "imported" source row. DateOfBooking preserves the
    // ORIGINAL capture time; importedAt is the separate audit timestamp.
    let batchDate;
    try {
      const sd = JSON.parse(trip.selectDate || "[]");
      batchDate = sd?.[Number(batchIndex) || 0]?.BatchDate;
    } catch { /* noop */ }

    const booking = await Bookings.create({
      userId: `${userId}`,
      bookingId: payment.id, // imported bookings are keyed by the real payment id
      tripId: `${tripId}`,
      paymentStatus: "created", // finalize flips this exactly once, below
      paymentType: amt.paymentType, // "full" | "firstPayment"
      mode: "live",
      source: "imported",
      assistedBy: adminId,
      importedAt: new Date(),
      orderAmount: receivedRupees,
      fullTripAmount: calc.total,
      total: receivedRupees,
      coupenDiscount: `${calc.discount}`,
      couponCode: calc.validCoupon ? couponCode : "",
      batchIndex: Number(batchIndex) || 0,
      travellersCount: calc.travellers,
      batchDate: batchDate ? `${batchDate}` : undefined,
      userName: customer.name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      DateOfBooking: payment.created_at ? new Date(payment.created_at * 1000) : new Date(),
    });

    // Confirm ONCE through the shared path (assigns invoice, sends confirmation).
    await finalizeBookingPaid(booking, {
      paymentId: payment.id,
      travellers: Array.isArray(travellers) ? travellers : undefined,
    });

    return res.status(201).json({
      message: "Payment imported and booking confirmed",
      data: {
        bookingId: booking.bookingId,
        _id: `${booking._id}`,
        paymentStatus: booking.paymentStatus,
        paymentType: booking.paymentType,
        invoiceNumber: booking.invoiceNumber || null,
        source: booking.source,
        amount: receivedRupees,
        fullAmount: calc.total,
      },
    });
  } catch (error) {
    console.error("confirmImportPayment error:", error?.message || error);
    return res.status(500).json({ error: "Could not import payment" });
  }
};
