// DB-free self-check for the booking-snapshot parity + invoice reconciliation
// guard. Guarantees the import-incident root cause cannot recur: an
// imported/assisted booking MUST carry the same paymentDetail + cardData
// snapshot a website booking does (so admin list + invoice render real data,
// not blanks), and an unreconciled snapshot MUST NOT be allowed to issue an
// invoice (so a zero-subtotal booking can never burn an FY invoice number).
//
// Run: node test_examples/bookingSnapshot.selfcheck.mjs
import assert from "node:assert/strict";
import { computeTripAmount, buildBookingSnapshots, isInvoiceIssuable } from "../controllers/Order.js";

let pass = 0;
const ok = (label, cond) => { assert.ok(cond, label); console.log("  ✓ " + label); pass++; };

// ── Fixture trip: one traveller section @ 17000, batch 0 dated, host populated ──
const trip = {
  _id: "trip_1",
  title: "Discover Andaman's Paradise !",
  location: "Andaman",
  price: "17000",
  days: "6",
  nights: "5",
  pickUp: "Port Blair",
  dropOff: "Port Blair",
  firstBookingPrice: "5000",
  partialPaymentEnabled: true,
  bannerImage: "banner.jpg",
  seoSlug: "andaman",
  addsection: JSON.stringify([{ array: [{ Title: "Traveller", TitlePrice: "17000" }] }]),
  selectDate: JSON.stringify([{ BatchDate: "2027-02-10" }]),
  endSelectDate: JSON.stringify([{ EndBatchDate: "2027-02-15" }]),
  numberOfDays: JSON.stringify([{ selectDays: "6" }]),
  host: { _id: "host_1", hostTitle: "Island Co", shortBio: "bio", hqLocation: "Port Blair", isVerified: true, brandingLogo: "logo.png" },
};

const calc = computeTripAmount(trip, { "0-0": 2 }); // 2 × 17000 = 34000, +5% GST
ok("calc base 34000", calc.base === 34000);
ok("calc travellers 2", calc.travellers === 2);
ok("calc total = base+gst (no coupon)", calc.total === Math.round(34000 * 1.05));

// ── buildBookingSnapshots: website/import/assisted all call this ──
const snap = buildBookingSnapshots(trip, calc, { batchIndex: 0, partialAllowed: false });
ok("paymentDetail has real trip title (not blank)", snap.paymentDetail.title === "Discover Andaman's Paradise !");
ok("paymentDetail days present", snap.paymentDetail.days === "6");
ok("paymentDetail host name mapped", snap.paymentDetail.host?.name === "Island Co");
ok("paymentDetail host verified", snap.paymentDetail.host?.verified === true);
ok("partialPaymentEnabled honours server verdict", snap.paymentDetail.partialPaymentEnabled === false);
ok("cardData numberOfTravelers set", snap.cardData.numberOfTravelers === 2);
ok("cardData line items present (invoice subtotal source)", snap.cardData.cardSectionData.length === 1);
ok("cardData gstTax set", snap.cardData.gstTax === calc.gst);
ok("cardData batchDate set (admin 'Date of Trip')", snap.cardData.cardDate.batchDate === "2027-02-10");
ok("cardData numberOfDays set", snap.cardData.cardDate.numberOfDays === "6");

// ── isInvoiceIssuable: the reconciliation gate ──
const goodBooking = {
  cardData: JSON.stringify(snap.cardData),
  coupenDiscount: `${calc.discount}`,
  fullTripAmount: calc.total,
};
ok("reconciled snapshot → issuable", isInvoiceIssuable(goodBooking).ok === true);

// The exact incident shape: no snapshot at all.
ok("empty cardData → BLOCKED (no line items)", isInvoiceIssuable({ cardData: "{}", fullTripAmount: 35699 }).ok === false);
ok("missing cardData → BLOCKED", isInvoiceIssuable({ fullTripAmount: 35699 }).ok === false);

// Line items present but grand total doesn't add up → blocked.
const mismatch = { cardData: JSON.stringify(snap.cardData), coupenDiscount: "0", fullTripAmount: calc.total + 1000 };
ok("subtotal ≠ grand total → BLOCKED", isInvoiceIssuable(mismatch).ok === false);

// Zero-price line item → blocked (zero taxable base).
const zeroItem = { cardData: JSON.stringify({ cardSectionData: [{ TitlePrice: "0", quantity: 1 }], gstTax: 0 }), coupenDiscount: "0", fullTripAmount: 35699 };
ok("zero taxable base → BLOCKED", isInvoiceIssuable(zeroItem).ok === false);

console.log(`\nbookingSnapshot.selfcheck: ${pass} checks passed`);
