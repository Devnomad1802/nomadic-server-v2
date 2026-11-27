// ─────────────────────────────────────────────────────────────
// Assisted bookings via Razorpay Payment Links (Admin-only) — directive §3/§4
//
// The admin builds a server-priced booking intent and generates a Razorpay
// payment LINK the customer pays in their own browser. Confirmation comes ONLY
// from the signed webhook (controllers/paymentWebhook.js) or an authoritative
// status poll — never from link creation/opening. Price is computed on the
// server (computeTripAmount); the browser never supplies an amount.
//
// Regenerating a link cancels the prior active link first, so two live links
// can't produce a double charge (directive §4).
// ─────────────────────────────────────────────────────────────
import Razorpay from "razorpay";
import { Bookings, Trips, User } from "../models/index.js";
import { keysForMode } from "../services/paymentAvailability.js";
import { isPartialAllowed } from "../utils/partialPayment.js";
import { requireValidApproval } from "../services/approvalGate.js";
import { computeTripAmount, finalizeBookingPaid } from "./Order.js";

const liveRazorpay = () => {
  const keys = keysForMode("live");
  if (!keys.key_id || !keys.key_secret) return null;
  return new Razorpay({ key_id: keys.key_id, key_secret: keys.key_secret });
};

const batchDateOf = (trip, batchIndex) => {
  try {
    const sd = JSON.parse(trip.selectDate || "[]");
    return sd?.[Number(batchIndex) || 0]?.BatchDate;
  } catch {
    return undefined;
  }
};

// Best-effort cancel of a link; swallow "already paid/cancelled" errors.
const safeCancelLink = async (rzp, linkId) => {
  if (!linkId) return;
  try { await rzp.paymentLink.cancel(linkId); } catch (e) { console.warn("link cancel skipped:", e?.error?.description || e?.message); }
};

// ── POST /api/admin/assisted-booking/link  (admin) ──────────────────────────
// Create (or regenerate) a payment link for a server-priced booking intent.
export const createAssistedLink = async (req, res) => {
  try {
    const adminId = req.user?._id;
    const rzp = liveRazorpay();
    if (!rzp) return res.status(500).json({ error: "Razorpay live credentials not configured" });

    const { userId, tripId, batchIndex, quantities, couponCode, paymentType } = req.body || {};
    if (!userId || !tripId) return res.status(400).json({ error: "userId (customer) and tripId are required" });

    const [customer, trip] = await Promise.all([
      User.findById(userId).select("name email phone").lean(),
      Trips.findById(tripId).lean(),
    ]);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.enableBooking === false) return res.status(400).json({ error: "Booking is disabled for this trip" });

    const bIdx = Number(batchIndex) || 0;
    const calc = computeTripAmount(trip, quantities, couponCode);
    if (calc.total <= 0 || calc.travellers <= 0) {
      return res.status(400).json({ error: "Invalid selection — choose at least one traveller/category." });
    }

    // Invite-only trips: assisted bookings must NOT bypass host approval.
    if (trip.bookingMode === "approval") {
      const gate = await requireValidApproval({ userId, tripId, batchIndex: bIdx, partySize: calc.travellers });
      if (!gate.ok) return res.status(gate.status).json({ error: gate.message, code: gate.code });
    }

    const batchDate = batchDateOf(trip, bIdx);
    const firstPrice = Math.round(Number(trip.firstBookingPrice) || 0);
    const partialAllowed = isPartialAllowed({
      partialPaymentEnabled: trip.partialPaymentEnabled,
      firstBookingPrice: trip.firstBookingPrice,
      departure: batchDate,
    });
    const wantPartial = paymentType === "firstPayment";
    const chargeNow = wantPartial && partialAllowed && firstPrice > 0 && firstPrice < calc.total ? firstPrice : calc.total;
    const finalType = chargeNow === calc.total ? "full" : "firstPayment";

    // Reuse an existing UNPAID assisted intent for the same customer+trip+batch
    // (cancel its stale link first); else create a fresh intent.
    let booking = await Bookings.findOne({
      userId: `${userId}`, tripId: `${tripId}`, batchIndex: bIdx,
      source: "admin_assisted", paymentStatus: "created",
    });
    if (booking?.paymentLinkId) await safeCancelLink(rzp, booking.paymentLinkId);

    const fields = {
      userId: `${userId}`, tripId: `${tripId}`, paymentStatus: "created",
      mode: "live", source: "admin_assisted", assistedBy: adminId,
      orderAmount: chargeNow, fullTripAmount: calc.total, total: chargeNow,
      coupenDiscount: `${calc.discount}`, couponCode: calc.validCoupon ? couponCode : "",
      batchIndex: bIdx, travellersCount: calc.travellers, paymentType: finalType,
      batchDate: batchDate ? `${batchDate}` : undefined,
      userName: customer.name || "", email: customer.email || "", phone: customer.phone || "",
    };
    if (booking) { Object.assign(booking, fields); await booking.save(); }
    else { booking = await Bookings.create({ ...fields, DateOfBooking: new Date() }); }

    // Unique per-link reference so a regenerated link never collides with a
    // prior (even cancelled) one; the webhook matches on paymentLinkId first.
    const link = await rzp.paymentLink.create({
      amount: chargeNow * 100,
      currency: "INR",
      accept_partial: false,
      reference_id: `nt_${booking._id}_${Date.now()}`,
      description: `${trip.title} — Nomadic Townies`,
      customer: { name: customer.name || "", email: customer.email || "", contact: customer.phone || "" },
      notify: { sms: !!customer.phone, email: !!customer.email },
      reminder_enable: true,
      notes: { bookingId: `${booking._id}`, tripId: `${tripId}`, userId: `${userId}`, source: "admin_assisted" },
      callback_url: `${process.env.CLIENT_URL || "https://nomadictownies.com"}/profile`,
      callback_method: "get",
      expire_by: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    });

    booking.paymentLinkId = link.id;
    booking.paymentLinkShortUrl = link.short_url;
    booking.paymentLinkStatus = link.status || "created";
    await booking.save();

    return res.status(201).json({
      message: "Payment link created",
      data: {
        bookingId: `${booking._id}`,
        shortUrl: link.short_url,
        paymentLinkId: link.id,
        amount: chargeNow,
        fullAmount: calc.total,
        paymentType: finalType,
        status: link.status,
        customer: { name: customer.name, email: customer.email, phone: customer.phone },
        trip: trip.title,
      },
    });
  } catch (error) {
    console.error("createAssistedLink error:", error?.error?.description || error?.message || error);
    return res.status(500).json({ error: error?.error?.description || "Could not create payment link" });
  }
};

// ── POST /api/admin/assisted-booking/cancel  (admin) ────────────────────────
export const cancelAssistedLink = async (req, res) => {
  try {
    const rzp = liveRazorpay();
    if (!rzp) return res.status(500).json({ error: "Razorpay live credentials not configured" });
    const { bookingId } = req.body || {};
    if (!bookingId) return res.status(400).json({ error: "bookingId is required" });

    const booking = await Bookings.findById(bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.paymentStatus && booking.paymentStatus !== "created") {
      return res.status(409).json({ error: "Already paid — cannot cancel the link", code: "ALREADY_PAID" });
    }
    await safeCancelLink(rzp, booking.paymentLinkId);
    booking.paymentLinkStatus = "cancelled";
    await booking.save();
    return res.json({ message: "Payment link cancelled", data: { bookingId: `${booking._id}` } });
  } catch (error) {
    console.error("cancelAssistedLink error:", error?.message || error);
    return res.status(500).json({ error: "Could not cancel payment link" });
  }
};

// ── GET /api/admin/assisted-booking/status/:bookingId  (admin) ──────────────
// Authoritative poll + fail-safe: if Razorpay says the link is paid but a lost
// webhook left the booking unconfirmed, finalize it here (idempotent).
export const getAssistedLinkStatus = async (req, res) => {
  try {
    const rzp = liveRazorpay();
    if (!rzp) return res.status(500).json({ error: "Razorpay live credentials not configured" });
    const { bookingId } = req.params || {};

    const booking = await Bookings.findById(bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!booking.paymentLinkId) return res.status(404).json({ error: "No payment link on this booking" });

    const link = await rzp.paymentLink.fetch(booking.paymentLinkId);
    const amountPaid = Number(link?.amount_paid || 0);

    // Poll fallback: reconcile a paid link whose webhook never arrived.
    if (String(link?.status) === "paid" && booking.paymentStatus === "created") {
      const fullPaise = Math.round(Number(booking.fullTripAmount || 0) * 100);
      const firstPaise = Math.round(Number(booking.orderAmount || 0) * 100);
      if (amountPaid === fullPaise) booking.paymentType = "full";
      else if (amountPaid === firstPaise && firstPaise < fullPaise) booking.paymentType = "firstPayment";
      if (amountPaid === fullPaise || amountPaid === firstPaise) {
        booking.paymentLinkStatus = "paid";
        const paymentId = Array.isArray(link?.payments) ? link.payments.find((p) => String(p?.status) === "captured")?.payment_id : undefined;
        await finalizeBookingPaid(booking, { paymentId });
      }
    } else {
      booking.paymentLinkStatus = link?.status || booking.paymentLinkStatus;
      await booking.save();
    }

    return res.json({
      data: {
        bookingId: `${booking._id}`,
        linkStatus: link?.status,
        amountPaid: amountPaid / 100,
        bookingPaymentStatus: booking.paymentStatus,
        shortUrl: booking.paymentLinkShortUrl,
      },
    });
  } catch (error) {
    console.error("getAssistedLinkStatus error:", error?.message || error);
    return res.status(500).json({ error: "Could not fetch link status" });
  }
};
