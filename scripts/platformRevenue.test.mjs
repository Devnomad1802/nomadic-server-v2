import assert from "node:assert";
import { isEarningBooking, platformCommissionPaise } from "../utils/bookingRevenue.js";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ✓", n); pass++; };

// rate map by tripId
const rates = { t10: 10, t20: 20, t15: 15 };
const rateFor = (b) => rates[b.tripId] || 0;

// 1. Zero bookings → ₹0.
assert.equal(platformCommissionPaise([], rateFor), 0);
ok("no bookings → 0 paise", true);

// 2. Single paid booking, 20% of ₹1000 = ₹200 = 20000 paise.
const one = [{ paymentStatus: "fullPayment", total: 1000, tripId: "t20" }];
assert.equal(platformCommissionPaise(one, rateFor), 20000);
ok("20% of ₹1000 = 20000 paise", true);

// 3. Variable commissions sum correctly.
//    t10: 10% of 500 = 50 (5000p); t15: 15% of 2000 = 300 (30000p) → 35000p.
const varied = [
  { paymentStatus: "firstPayment", total: 500, tripId: "t10" },
  { paymentStatus: "paid", total: 2000, tripId: "t15" },
];
assert.equal(platformCommissionPaise(varied, rateFor), 35000);
ok("variable rates sum (₹350)", true);

// 4. Cancelled / refunded excluded (DEAD set).
const dead = [
  { paymentStatus: "fullPayment", total: 1000, tripId: "t20", status: "cancelled" },
  { paymentStatus: "refunded", total: 1000, tripId: "t20" },
];
assert.equal(platformCommissionPaise(dead, rateFor), 0);
assert.equal(dead.every((b) => !isEarningBooking(b)), true);
ok("cancelled/refunded contribute 0", true);

// 5. Unpaid (created) excluded.
assert.equal(platformCommissionPaise([{ paymentStatus: "created", total: 999, tripId: "t20" }], rateFor), 0);
ok("unpaid 'created' → 0", true);

// 6. Missing trip / zero rate → 0 contribution (never guess a rate).
assert.equal(platformCommissionPaise([{ paymentStatus: "fullPayment", total: 1000, tripId: "unknown" }], rateFor), 0);
assert.equal(platformCommissionPaise([{ paymentStatus: "fullPayment", total: 1000, tripId: "t20" }], () => 0), 0);
ok("no rate → 0 contribution", true);

// 7. Partial advance counts (firstPayment) on the PAID amount only.
//    15% of ₹400 paid (not full trip price) = ₹60 = 6000p.
assert.equal(platformCommissionPaise([{ paymentStatus: "firstPayment", total: 400, tripId: "t15" }], rateFor), 6000);
ok("partial advance commission on paid amount", true);

// 8. Decimal-safe rounding: 15% of ₹333 = ₹49.95 → 4995 paise (no float drift).
assert.equal(platformCommissionPaise([{ paymentStatus: "paid", total: 333, tripId: "t15" }], rateFor), 4995);
ok("paise rounding is exact (₹49.95)", true);

// 9. Mixed batch reconciles to the per-booking sum.
const mixed = [
  { paymentStatus: "fullPayment", total: 1000, tripId: "t20" }, // 20000
  { paymentStatus: "created", total: 5000, tripId: "t20" },     // 0 (unpaid)
  { paymentStatus: "paid", total: 2000, tripId: "t15" },        // 30000
  { paymentStatus: "fullPayment", total: 800, tripId: "t10", status: "cancelled" }, // 0
];
assert.equal(platformCommissionPaise(mixed, rateFor), 50000); // ₹500
ok("mixed batch reconciles to ₹500", true);

console.log(`\nAll ${pass} checks passed.`);
