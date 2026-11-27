// ─────────────────────────────────────────────────────────────
// Razorpay PAYMENT webhook (assisted payment links) — directive §4
//
// Confirms an assisted-booking payment link ONLY from Razorpay's authoritative,
// signature-verified webhook. A link opened/abandoned/failed/expired never
// confirms anything (directive §4). This endpoint is mounted with a RAW body
// parser BEFORE express.json()/mongoSanitize() so the HMAC is computed over the
// exact bytes Razorpay signed — the correct way (the older payout webhook
// re-stringifies the parsed body, which this deliberately does not copy).
//
// Confirmation funnels through the shared finalizeBookingPaid() — the single
// idempotent confirm point — so a replayed/out-of-order webhook can never
// double-confirm, double-invoice or double-count.
// ─────────────────────────────────────────────────────────────
import crypto from "crypto";
import { Bookings } from "../models/index.js";
import { finalizeBookingPaid } from "./Order.js";

// ── Pure helpers (exported for unit tests; no DB, no network) ─────────────────

/**
 * Verify a Razorpay webhook signature over the RAW request body.
 * @param rawBody Buffer|string — the exact received bytes
 * @param signature the x-razorpay-signature header
 * @param secret the environment-specific webhook secret
 * @returns boolean — timing-safe
 */
export const verifyWebhookSignature = (rawBody, signature, secret) => {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody)))
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Classify a webhook event into the kinds we act on (else null → ignore). */
export const paymentEventKind = (event) => {
  switch (String(event || "")) {
    case "payment_link.paid": return "link_paid";
    case "payment_link.partially_paid": return "link_partial";
    case "payment.captured": return "payment_captured";
    default: return null;
  }
};

/**
 * Decide the booking payment type from the amount actually paid on the link
 * (all PAISE). Exact full → "full"; exact advance (< full) → "firstPayment";
 * anything else → null (flag for reconciliation, never auto-confirm).
 */
export const decidePaymentType = (amountPaidPaise, fullPaise, firstPaise) => {
  const paid = Math.round(Number(amountPaidPaise) || 0);
  const full = Math.round(Number(fullPaise) || 0);
  const first = Math.round(Number(firstPaise) || 0);
  if (full > 0 && paid === full) return "full";
  if (first > 0 && paid === first && first < full) return "firstPayment";
  return null;
};

// ── Handler ───────────────────────────────────────────────────────────────
// Always 200 for a verified-but-unactionable event (so Razorpay stops
// retrying); 401 only for a bad/missing signature.
export const handlePaymentWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_PAYMENT_WEBHOOK_SECRET;
    if (!secret) {
      console.error("payment webhook: RAZORPAY_PAYMENT_WEBHOOK_SECRET not set");
      return res.status(500).json({ error: "Webhook not configured" });
    }
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.body; // Buffer (express.raw) — see routes/paymentWebhook.js
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    let evt;
    try {
      evt = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody));
    } catch {
      return res.status(400).json({ error: "Malformed webhook body" });
    }

    const kind = paymentEventKind(evt?.event);
    if (!kind) return res.status(200).json({ ignored: true, reason: "event not relevant" });

    const link = evt?.payload?.payment_link?.entity || null;
    const payment = evt?.payload?.payment?.entity || null;

    // We only confirm assisted bookings via a payment LINK (reference_id is our
    // booking id). A bare payment.captured with no link reference is ignored
    // here (the website flow confirms those through its own signed callback).
    if (!link) return res.status(200).json({ ignored: true, reason: "no payment_link entity" });

    // Match on the stored payment link id first (always exact); fall back to the
    // booking id embedded in reference_id (format: nt_<objectId>_<ts>).
    let booking = null;
    if (link.id) booking = await Bookings.findOne({ paymentLinkId: link.id });
    if (!booking && link.reference_id) {
      const m = String(link.reference_id).match(/[0-9a-fA-F]{24}/);
      if (m) booking = await Bookings.findById(m[0]).catch(() => null);
    }
    if (!booking) return res.status(200).json({ ignored: true, reason: "no matching booking" });

    // Environment + currency guards. Assisted links are live-only.
    if (booking.mode === "test") return res.status(200).json({ ignored: true, reason: "test booking" });
    const currency = String(link.currency || payment?.currency || "INR").toUpperCase();
    if (currency !== "INR") return res.status(200).json({ ignored: true, reason: "non-INR" });

    // Already finalized (prior webhook / poll won the race) → idempotent no-op.
    if (booking.paymentStatus && booking.paymentStatus !== "created") {
      return res.status(200).json({ ok: true, alreadyConfirmed: true });
    }

    const amountPaid = Number(link.amount_paid ?? payment?.amount ?? 0);
    const fullPaise = Math.round(Number(booking.fullTripAmount || 0) * 100);
    const firstPaise = Math.round(Number(booking.orderAmount || 0) * 100); // the link's charge-now
    const paymentType = decidePaymentType(amountPaid, fullPaise, firstPaise);

    if (!paymentType) {
      // Captured money that does not match the expected full/advance amount —
      // never silently force a confirmation. Flag for ops; ack so Razorpay stops.
      console.warn(`payment webhook: amount mismatch for booking ${booking._id} (paid ${amountPaid}p, full ${fullPaise}p, advance ${firstPaise}p) — flag for reconciliation`);
      booking.status = "PAYMENT_AMOUNT_MISMATCH";
      await booking.save();
      return res.status(200).json({ ok: true, flagged: "amount_mismatch" });
    }

    booking.paymentType = paymentType;
    booking.paymentLinkStatus = link.status || "paid";
    await finalizeBookingPaid(booking, { paymentId: payment?.id });

    return res.status(200).json({ ok: true, bookingId: `${booking._id}`, paymentType });
  } catch (error) {
    console.error("handlePaymentWebhook error:", error?.message || error);
    // 500 lets Razorpay retry a genuinely transient failure.
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};
