// DB-free self-check for the host booking truth helpers. Guarantees that a
// pure checkout attempt (paymentStatus "created"/empty, never paid) is NEVER
// treated as a real booking or labelled "full" — the root cause of the host
// dashboard showing abandoned attempts as paid bookings.
//
// Run: node test_examples/hostBookingState.selfcheck.mjs
import assert from "node:assert/strict";
import { isEarningBooking, isDeadBooking, isRealBooking, paymentStateOf } from "../utils/bookingRevenue.js";

let pass = 0;
const ok = (label, cond) => { assert.ok(cond, label); console.log("  ✓ " + label); pass++; };

const attempt = { paymentStatus: "created", status: "" };          // the 9 Banaras rows
const empty = { paymentStatus: "", status: "" };
const full = { paymentStatus: "fullPayment", status: "" };
const partial = { paymentStatus: "firstPayment", status: "" };
const refunded = { paymentStatus: "refunded", status: "" };
const cancelled = { paymentStatus: "fullPayment", status: "cancelled" };

// 1. Checkout attempts are NOT real bookings and NOT earning.
ok("created attempt: not earning", !isEarningBooking(attempt));
ok("created attempt: not dead", !isDeadBooking(attempt));
ok("created attempt: NOT a real booking", !isRealBooking(attempt));
ok("empty status: NOT a real booking", !isRealBooking(empty));

// 2. Attempts never get a money-positive label.
ok("created attempt: paymentState=pending (never 'full')", paymentStateOf(attempt) === "pending");
ok("empty: paymentState=pending (never 'full')", paymentStateOf(empty) === "pending");

// 3. Genuine payments classify correctly.
ok("full: earning + real", isEarningBooking(full) && isRealBooking(full));
ok("full: paymentState=full", paymentStateOf(full) === "full");
ok("partial: earning + real", isEarningBooking(partial) && isRealBooking(partial));
ok("partial: paymentState=partial", paymentStateOf(partial) === "partial");

// 4. Dead (cancelled/refunded) rows: real (for cancelled history) but not earning.
ok("refunded: dead + real, not earning", isDeadBooking(refunded) && isRealBooking(refunded) && !isEarningBooking(refunded));
ok("refunded: paymentState=refunded", paymentStateOf(refunded) === "refunded");
ok("cancelled(once-paid): dead, not earning", isDeadBooking(cancelled) && !isEarningBooking(cancelled));

// 5. Null / undefined safety.
ok("null booking: not real", !isRealBooking(null));
ok("undefined paymentState: pending", paymentStateOf(undefined) === "pending");

console.log(`\nAll ${pass} checks passed.`);
