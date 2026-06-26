import "dotenv/config";
import Razorpay from "razorpay";
import crypto from "crypto";
import { BadRequest, CustomError } from "../middlewares/index.js";
import { Bookings, Trips } from "../models/index.js";

const { RAZORPAY_KEY_SECRET, RAZORPAY_KEY_ID } = process.env;

// ─────────────────────────────────────────────────────────────
// C1/C2 — Secure payment flow
// The server, never the browser, decides the price and confirms payment.
// ─────────────────────────────────────────────────────────────

// Flatten a Trip.discount field (array of strings, sometimes JSON like '["CODE"]')
// into a flat list of coupon codes.
const couponCodes = (trip) => {
  const out = [];
  (Array.isArray(trip?.discount) ? trip.discount : []).forEach((d) => {
    try {
      const p = JSON.parse(d);
      if (Array.isArray(p)) out.push(...p);
      else out.push(d);
    } catch {
      out.push(d);
    }
  });
  return out.map((c) => `${c}`.trim()).filter(Boolean);
};

// Recompute the price from the DB trip + the user's selections.
// Mirrors the client math but is the single source of truth.
const computeTripAmount = (trip, quantities, couponCode) => {
  let sections = [];
  try { sections = JSON.parse(trip?.addsection || "[]"); } catch { sections = []; }
  const q = quantities && typeof quantities === "object" ? quantities : {};

  let base = 0;
  let travellers = 0;
  const lineItems = [];
  Object.entries(q).forEach(([key, qtyRaw]) => {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) return;
    const [si, ii] = key.split("-");
    const item = sections?.[si]?.array?.[ii];
    if (!item) return;
    const price = parseInt(item.TitlePrice, 10) || 0;
    base += qty * price;
    if (si === "0") travellers += qty; // first section = travellers
    lineItems.push({ ...item, quantity: qty });
  });

  const codes = couponCodes(trip);
  const valid = !!couponCode && codes.some((c) => c.toLowerCase() === `${couponCode}`.trim().toLowerCase());
  const discount = valid ? base * 0.1 : 0;
  const gst = (base - discount) * 0.05;
  const total = Math.round(base - discount + gst);
  return { base, discount: Math.round(discount), gst: Math.round(gst), total, travellers, validCoupon: valid, lineItems };
};

// Step 1 — create a Razorpay order for a server-computed amount, and store a
// PENDING booking keyed by the order id. Browser sends WHAT they want, not how
// much it costs.
export const createSecureOrder = async (req, res) => {
  try {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ error: "Razorpay credentials not configured" });
    }
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { tripId, quantities, couponCode, batchIndex, paymentType } = req.body || {};
    if (!tripId) return res.status(400).json({ error: "tripId is required" });

    const trip = await Trips.findById(tripId).populate("host");
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.enableBooking === false) return res.status(400).json({ error: "Booking is disabled for this trip" });

    const calc = computeTripAmount(trip, quantities, couponCode);
    if (calc.total <= 0 || calc.travellers <= 0) {
      return res.status(400).json({ error: "Invalid selection — choose at least one traveller." });
    }

    // Partial payment (book-now-pay-later) charges firstBookingPrice; else full.
    const wantPartial = paymentType === "firstPayment";
    const firstPrice = Math.round(Number(trip.firstBookingPrice) || 0);
    const chargeNow = wantPartial && firstPrice > 0 && firstPrice < calc.total ? firstPrice : calc.total;
    const finalType = chargeNow === calc.total ? "full" : "firstPayment";

    const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
    const order = await razorpay.orders.create({
      amount: chargeNow * 100, // paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`, // Razorpay limit: <= 40 chars
      notes: { tripId: `${tripId}`, userId: `${userId}` },
    });
    if (!order?.id) return res.status(502).json({ error: "Could not create payment order" });

    // Date snapshot for the success page (mirrors old cardData shape).
    let batchDate;
    let endSelectDate;
    let numberOfDays;
    try {
      const sd = JSON.parse(trip.selectDate || "[]");
      const ed = JSON.parse(trip.endSelectDate || "[]");
      const nd = JSON.parse(trip.numberOfDays || "[]");
      batchDate = sd?.[batchIndex]?.BatchDate;
      endSelectDate = ed?.[batchIndex]?.EndBatchDate;
      numberOfDays = nd?.[batchIndex]?.selectDays;
    } catch { /* noop */ }

    const cardData = {
      numberOfTravelers: calc.travellers,
      cardDate: { batchDate, endSelectDate, numberOfDays },
      gstTax: calc.gst,
      cardSectionData: calc.lineItems,
    };
    const h = trip.host && typeof trip.host === "object" ? trip.host : null;
    const paymentDetail = {
      _id: `${trip._id}`,
      title: trip.title,
      location: trip.location,
      price: trip.price,
      days: trip.days,
      nights: trip.nights,
      pickUp: trip.pickUp,
      dropOff: trip.dropOff,
      firstBookingPrice: trip.firstBookingPrice,
      bannerImage: trip.bannerImage || trip.cardImage || null,
      seoSlug: trip.seoSlug || "",
      host: h
        ? {
            name: h.hostTitle || h.hostName || "",
            location: h.hqLocation || h.location || "",
            verified: !!h.isVerified,
            logo: h.brandingLogo || null,
          }
        : null,
    };

    await Bookings.create({
      userId: `${userId}`,
      bookingId: order.id,
      razorpayOrderId: order.id,
      tripId: `${tripId}`,
      paymentStatus: "created", // pending until confirmed
      orderAmount: chargeNow,
      fullTripAmount: calc.total,
      total: chargeNow,
      coupenDiscount: `${calc.discount}`,
      couponCode: calc.validCoupon ? couponCode : "",
      batchIndex: Number(batchIndex) || 0,
      travellersCount: calc.travellers,
      paymentType: finalType,
      batchDate: batchDate ? `${batchDate}` : undefined,
      paymentDetail: JSON.stringify(paymentDetail),
      cardData: JSON.stringify(cardData),
      DateOfBooking: new Date(),
    });

    return res.json({
      orderId: order.id,
      amount: chargeNow, // rupees (server-decided)
      currency: "INR",
      key: RAZORPAY_KEY_ID,
      breakdown: { base: calc.base, discount: calc.discount, gst: calc.gst, total: calc.total, chargeNow, paymentType: finalType },
    });
  } catch (error) {
    console.error("createSecureOrder error:", error?.message || error);
    return res.status(500).json({ error: "Could not start payment" });
  }
};

// Step 2 — verify Razorpay's signature, then mark PAID + decrement seats, once.
// Browser sends only the 3 receipt codes; it cannot lie about price or status.
export const confirmBooking = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!RAZORPAY_KEY_SECRET) return res.status(500).json({ error: "Razorpay credentials not configured" });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, travellers, emergencyContact, dietary, roomType } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    // Verify the tamper-proof signature.
    const expected = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    const ok = expected.length === `${razorpay_signature}`.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(`${razorpay_signature}`));
    if (!ok) return res.status(400).json({ error: "Payment signature verification failed" });

    const booking = await Bookings.findOne({ razorpayOrderId: razorpay_order_id });
    if (!booking) return res.status(404).json({ error: "Order not found" });
    if (`${booking.userId}` !== `${userId}`) return res.status(403).json({ error: "Forbidden" });

    // Idempotency: if already confirmed, just return it (no double seat decrement).
    if (booking.paymentStatus && booking.paymentStatus !== "created") {
      return res.status(200).json({ message: "Already confirmed", data: booking });
    }

    // Decrement seats on the chosen batch (best-effort, never below zero).
    try {
      const trip = await Trips.findById(booking.tripId);
      if (trip) {
        const seats = JSON.parse(trip.numberOfSeats || "[]");
        const idx = Number(booking.batchIndex) || 0;
        const avail = parseInt(seats?.[idx]?.batchSeats, 10) || 0;
        const need = Number(booking.travellersCount) || 1;
        if (seats?.[idx]) {
          seats[idx].batchSeats = `${Math.max(0, avail - need)}`;
          trip.numberOfSeats = JSON.stringify(seats);
          await trip.save();
        }
        if (avail < need) booking.status = "SEATS_OVERBOOKED"; // flag for ops; payment already taken
      }
    } catch (e) {
      console.error("seat decrement failed:", e?.message || e);
    }

    // Mark PAID with the SERVER amount (never the client's).
    booking.paymentStatus = booking.paymentType === "firstPayment" ? "firstPayment" : "fullPayment";
    booking.razorpayPaymentId = razorpay_payment_id;
    if (Array.isArray(travellers)) booking.travellers = travellers;
    if (emergencyContact) booking.emergencyContact = emergencyContact;
    if (dietary !== undefined) booking.dietary = dietary;
    if (roomType !== undefined) booking.roomType = roomType;
    booking.DateOfBooking = new Date();
    await booking.save();

    return res.status(200).json({ message: "Booking confirmed", data: booking });
  } catch (error) {
    console.error("confirmBooking error:", error?.message || error);
    return res.status(500).json({ error: "Could not confirm booking" });
  }
};

// Recompute the full trip amount from the SERVER-stored booking snapshot
// (never the client). Prefers fullTripAmount; else rebuilds from cardData.
const fullAmountFromBooking = (booking) => {
  if (Number(booking.fullTripAmount) > 0) return Math.round(Number(booking.fullTripAmount));
  let card = {};
  try { card = JSON.parse(booking.cardData || "{}"); } catch { card = {}; }
  const items = Array.isArray(card?.cardSectionData) ? card.cardSectionData : [];
  const base = items.reduce((s, it) => s + (parseInt(it.TitlePrice, 10) || 0) * (Number(it.quantity) || 0), 0);
  const gst = Number(card?.gstTax) || 0;
  const discount = Number(booking.coupenDiscount) || 0;
  return Math.round(base - discount + gst);
};

// Balance step 1 — create a Razorpay order for the REMAINING balance of a
// firstPayment booking. Server computes the remaining; client sends only the
// booking id.
export const createBalanceOrder = async (req, res) => {
  try {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ error: "Razorpay credentials not configured" });
    }
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { bookingId } = req.body || {};
    if (!bookingId) return res.status(400).json({ error: "bookingId is required" });

    const booking = await Bookings.findById(bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (`${booking.userId}` !== `${userId}`) return res.status(403).json({ error: "Forbidden" });

    const fullTotal = fullAmountFromBooking(booking);
    const paid = Math.round(Number(booking.total) || 0);
    const remaining = fullTotal - paid;
    if (remaining <= 0) return res.status(400).json({ error: "No balance due on this booking" });

    const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
    const order = await razorpay.orders.create({
      amount: remaining * 100, // paise
      currency: "INR",
      receipt: `bal_${Date.now()}`, // <= 40 chars
      notes: { bookingId: `${booking._id}`, userId: `${userId}` },
    });
    if (!order?.id) return res.status(502).json({ error: "Could not create payment order" });

    booking.balanceOrderId = order.id;
    booking.balanceAmount = remaining;
    await booking.save();

    return res.json({
      orderId: order.id,
      amount: remaining, // rupees (server-decided)
      currency: "INR",
      key: RAZORPAY_KEY_ID,
      breakdown: { fullTotal, paid, remaining },
    });
  } catch (error) {
    console.error("createBalanceOrder error:", error?.message || error);
    return res.status(500).json({ error: "Could not start payment" });
  }
};

// Balance step 2 — verify signature, then mark the booking fully paid + add the
// balance to total. Idempotent on replay.
export const confirmBalancePayment = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!RAZORPAY_KEY_SECRET) return res.status(500).json({ error: "Razorpay credentials not configured" });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    const expected = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    const okSig = expected.length === `${razorpay_signature}`.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(`${razorpay_signature}`));
    if (!okSig) return res.status(400).json({ error: "Payment signature verification failed" });

    const booking = await Bookings.findOne({ balanceOrderId: razorpay_order_id });
    if (!booking) return res.status(404).json({ error: "Order not found" });
    if (`${booking.userId}` !== `${userId}`) return res.status(403).json({ error: "Forbidden" });

    // Idempotency: already settled → return as-is, no double credit.
    if (booking.paymentStatus === "fullPayment") {
      return res.status(200).json({ message: "Already confirmed", data: booking });
    }

    const balance = Math.round(Number(booking.balanceAmount) || 0);
    booking.total = Math.round(Number(booking.total) || 0) + balance;
    booking.paymentStatus = "fullPayment";
    booking.paymentType = "full";
    booking.razorpayPaymentId = razorpay_payment_id;
    booking.balanceOrderId = undefined;
    booking.balanceAmount = undefined;
    booking.DateOfBooking = new Date();

    // Refresh the success-page snapshot from the current trip so even an OLD
    // booking (made before host/banner existed) shows the full new page.
    try {
      const trip = await Trips.findById(booking.tripId).populate("host");
      if (trip) {
        let pd = {};
        try { pd = JSON.parse(booking.paymentDetail || "{}"); } catch { pd = {}; }
        const h = trip.host && typeof trip.host === "object" ? trip.host : null;
        booking.paymentDetail = JSON.stringify({
          ...pd,
          _id: `${trip._id}`,
          title: pd.title || trip.title,
          location: pd.location || trip.location,
          days: pd.days || trip.days,
          nights: pd.nights || trip.nights,
          price: pd.price || trip.price,
          bannerImage: trip.bannerImage || trip.cardImage || pd.bannerImage || null,
          seoSlug: trip.seoSlug || pd.seoSlug || "",
          host: h
            ? { name: h.hostTitle || h.hostName || "", location: h.hqLocation || h.location || "", verified: !!h.isVerified, logo: h.brandingLogo || null }
            : (pd.host || null),
        });
      }
    } catch (e) {
      console.error("balance snapshot refresh failed:", e?.message || e);
    }

    await booking.save();

    return res.status(200).json({ message: "Balance paid — booking fully confirmed", data: booking });
  } catch (error) {
    console.error("confirmBalancePayment error:", error?.message || error);
    return res.status(500).json({ error: "Could not confirm payment" });
  }
};

export const order = async (req, res) => {
  try {
    // Validate Razorpay credentials
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new CustomError("Razorpay credentials not configured", 500);
    }

    const razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });

    if (!req.body) {
      throw new CustomError("Bad Request", 400);
    }

    // Validate required fields for Razorpay order
    const { amount, currency, receipt } = req.body;
    if (!amount || !currency || !receipt) {
      throw new CustomError(
        "Missing required fields: amount, currency, receipt",
        400
      );
    }

    const options = req.body;

    const order = await razorpay.orders.create(options);

    if (!order) {
      throw new CustomError("Bad Request", 400);
    }

    res.json(order);
  } catch (error) {
    console.log("Final error message:", error);
    throw new BadRequest(error);
  }
};

export const validate = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new CustomError(
        "Missing required payment verification fields",
        400
      );
    }

    // Validate Razorpay credentials
    if (!RAZORPAY_KEY_SECRET) {
      throw new CustomError("Razorpay credentials not configured", 500);
    }

    const sha = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET);
    // order_id + " | " + razorpay_payment_id

    sha.update(`${razorpay_order_id}|${razorpay_payment_id}`);

    const digest = sha.digest("hex");

    if (digest !== razorpay_signature) {
      return res.status(400).json({ msg: " Transaction is not legit!" });
    }

    res.json({
      msg: " Transaction is legit!",
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    });
  } catch (error) {
    console.log("Validation error:", error);
    throw new BadRequest(error?.message || "Payment validation failed");
  }
};
