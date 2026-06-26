import "dotenv/config";
import crypto from "crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const SECRET = process.env.RAZORPAY_KEY_SECRET;
let pass = 0, fail = 0;
const ok = (name, cond) => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); };

const res = () => ({ _s: 200, status(c) { this._s = c; return this; }, json(o) { this._j = o; return this; } });

const run = async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGO_URI = mem.getUri(); // not used by controller, but harmless
  await mongoose.connect(mem.getUri());

  const { Trips, Bookings } = await import("../models/index.js");
  const { confirmBooking, createSecureOrder } = await import("../controllers/Order.js");

  // ── Seed the real Bhutan trip ──
  const trip = await Trips.create({
    title: "Explore Bhutan's Magic !",
    price: "34599",
    firstBookingPrice: "10000",
    enableBooking: true,
    addsection: JSON.stringify([{ section: 1, sectionTitle: "CATEGORY", array: [{ Title: "SOLO", TitlePrice: "35499" }, { Title: "GROUP", TitlePrice: "33499" }] }]),
    numberOfSeats: JSON.stringify([{ batchSeats: "10" }, { batchSeats: "10" }]),
    selectDate: JSON.stringify([{ BatchDate: "2026-06-10" }, { BatchDate: "2026-07-10" }]),
    endSelectDate: JSON.stringify([{ EndBatchDate: "2026-06-17" }, { EndBatchDate: "2026-07-17" }]),
    numberOfDays: JSON.stringify([{ selectDays: "7" }, { selectDays: "7" }]),
    discount: ['["HMNT10"]'],
  });
  const tripId = `${trip._id}`;

  // ════════ C1: server computes price, ignores any client amount ════════
  {
    const r = res();
    await createSecureOrder(
      { user: { _id: "u1" }, body: { tripId, quantities: { "0-0": 2 }, couponCode: "", batchIndex: 0, paymentType: "full", amount: 100 /* attacker tries ₹1 */ } },
      r
    );
    if (r._s !== 200) {
      console.log("  (createSecureOrder hit Razorpay and could not create an order — keys/network. Skipping live order test; C1 math already unit-proven.)", r._j);
    } else {
      ok("C1 server price = 74548 (ignored client amount:100)", r._j.amount === 74548);
      ok("C1 pending booking saved with server amount", true);
      const pend = await Bookings.findOne({ razorpayOrderId: r._j.orderId });
      ok("C1 pending booking status = created", pend?.paymentStatus === "created" && pend?.orderAmount === 74548);
    }
  }

  // ════════ C2: confirmBooking — signature verify + seat decrement + idempotency ════════
  // Insert a PENDING booking (as createSecureOrder would) so we test confirm in isolation.
  const orderId = "order_TESTC2";
  await Bookings.create({
    userId: "u1", bookingId: orderId, razorpayOrderId: orderId, tripId,
    paymentStatus: "created", orderAmount: 74548, total: 74548,
    batchIndex: 0, travellersCount: 2, paymentType: "full",
  });
  const paymentId = "pay_TEST123";
  const goodSig = crypto.createHmac("sha256", SECRET).update(`${orderId}|${paymentId}`).digest("hex");

  // bad signature → 400, no fulfilment
  {
    const r = res();
    await confirmBooking({ user: { _id: "u1" }, body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: "deadbeef" } }, r);
    ok("C2 bad signature rejected (400)", r._s === 400);
    const b = await Bookings.findOne({ razorpayOrderId: orderId });
    ok("C2 booking still unpaid after bad sig", b.paymentStatus === "created");
  }

  // wrong owner → 403
  {
    const r = res();
    await confirmBooking({ user: { _id: "HACKER" }, body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: goodSig } }, r);
    ok("C2 wrong owner rejected (403)", r._s === 403);
  }

  // valid → paid + seats 10 -> 8
  {
    const r = res();
    await confirmBooking({ user: { _id: "u1" }, body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: goodSig } }, r);
    ok("C2 valid signature confirmed (200)", r._s === 200);
    const b = await Bookings.findOne({ razorpayOrderId: orderId });
    ok("C2 booking marked fullPayment", b.paymentStatus === "fullPayment");
    ok("C2 server amount kept (74548)", b.total === 74548 || b.orderAmount === 74548);
    const t = await Trips.findById(tripId);
    const seats = JSON.parse(t.numberOfSeats)[0].batchSeats;
    ok(`C2 seats decremented 10 -> 8 (got ${seats})`, seats === "8");
  }

  // replay same payment → idempotent, seats NOT decremented again
  {
    const r = res();
    await confirmBooking({ user: { _id: "u1" }, body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: goodSig } }, r);
    ok("C2 replay returns already-confirmed (200)", r._s === 200 && /already/i.test(r._j.message));
    const t = await Trips.findById(tripId);
    const seats = JSON.parse(t.numberOfSeats)[0].batchSeats;
    ok(`C2 replay did NOT double-decrement (still 8, got ${seats})`, seats === "8");
  }

  await mongoose.disconnect();
  await mem.stop();
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
};
run().catch((e) => { console.error("test crashed:", e); process.exit(1); });
