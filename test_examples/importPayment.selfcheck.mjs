// DB-free self-check for the Import-Existing-Payment guards. Guarantees the two
// safety invariants that protect money: an ineligible payment (uncaptured,
// refunded, wrong currency) is NEVER importable, and an amount that does not
// match the trip is NEVER forced into a paid booking.
//
// Run: node test_examples/importPayment.selfcheck.mjs
import assert from "node:assert/strict";
import {
  classifyImportPayment,
  matchImportAmount,
  maskEmail,
  maskPhone,
} from "../controllers/importPayment.js";

let pass = 0;
const ok = (label, cond) => { assert.ok(cond, label); console.log("  ✓ " + label); pass++; };

// ── classifyImportPayment (amounts in paise) ──
const captured = { id: "pay_1", status: "captured", currency: "INR", amount: 3569900, amount_refunded: 0 };
ok("captured INR, no refund → eligible", classifyImportPayment(captured).ok === true);
ok("authorized (not captured) → rejected", classifyImportPayment({ ...captured, status: "authorized" }).code === "NOT_CAPTURED");
ok("failed → rejected", classifyImportPayment({ ...captured, status: "failed" }).code === "NOT_CAPTURED");
ok("fully refunded → rejected", classifyImportPayment({ ...captured, amount_refunded: 3569900 }).code === "REFUNDED");
ok("partially refunded → review (not auto)", classifyImportPayment({ ...captured, amount_refunded: 100000 }).code === "PARTIAL_REFUND");
ok("non-INR → rejected", classifyImportPayment({ ...captured, currency: "USD" }).code === "CURRENCY");
ok("no id → NOT_FOUND", classifyImportPayment({ status: "captured" }).code === "NOT_FOUND");
ok("null payment → NOT_FOUND", classifyImportPayment(null).code === "NOT_FOUND");

// ── matchImportAmount (rupees) ──
ok("exact full → paymentType 'full'", matchImportAmount(35699, 35699, 5000).paymentType === "full");
ok("exact advance (<full) → 'firstPayment'", matchImportAmount(5000, 35699, 5000).paymentType === "firstPayment");
ok("advance == full → NOT partial", matchImportAmount(35699, 35699, 35699).paymentType === "full");
ok("between amounts → mismatch, no type", matchImportAmount(20000, 35699, 5000).paymentType === null);
ok("over full → excess, no type", matchImportAmount(40000, 35699, 5000).match === "excess" && matchImportAmount(40000, 35699, 5000).paymentType === null);
ok("zero received → no type", matchImportAmount(0, 35699, 5000).paymentType === null);

// ── masking (no PII leakage in evidence) ──
ok("maskEmail hides local part", maskEmail("john@example.com") === "j***@example.com");
ok("maskEmail short local", maskEmail("a@b.com") === "a***@b.com");
ok("maskEmail empty → empty", maskEmail("") === "");
ok("maskPhone keeps last 2 only", /\*+10$/.test(maskPhone("9876543210")));
ok("maskPhone never reveals full", !maskPhone("9876543210").includes("98765"));
ok("maskPhone empty → empty", maskPhone("") === "");

console.log(`\nimportPayment self-check: ${pass} assertions passed.`);
