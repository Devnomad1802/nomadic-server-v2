// DB-free self-check for the Razorpay payment-webhook guards. Guarantees the
// signature is verified over the RAW bytes, only relevant events act, and a
// captured amount that doesn't match the expected full/advance is NEVER turned
// into a confirmation (returns null → flagged for reconciliation).
//
// Run: node test_examples/paymentWebhook.selfcheck.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  verifyWebhookSignature,
  paymentEventKind,
  decidePaymentType,
} from "../controllers/paymentWebhook.js";

let pass = 0;
const ok = (label, cond) => { assert.ok(cond, label); console.log("  ✓ " + label); pass++; };

// ── verifyWebhookSignature (raw body + timing-safe) ──
const secret = "whsec_test_123";
const raw = Buffer.from(JSON.stringify({ event: "payment_link.paid", payload: { x: 1 } }));
const good = crypto.createHmac("sha256", secret).update(raw).digest("hex");
ok("valid signature over raw body → true", verifyWebhookSignature(raw, good, secret) === true);
ok("accepts string body too", verifyWebhookSignature(raw.toString(), good, secret) === true);
ok("wrong signature → false", verifyWebhookSignature(raw, "deadbeef", secret) === false);
ok("tampered body → false", verifyWebhookSignature(Buffer.from(raw.toString() + " "), good, secret) === false);
ok("wrong secret → false", verifyWebhookSignature(raw, good, "other") === false);
ok("missing signature → false", verifyWebhookSignature(raw, "", secret) === false);
ok("missing secret → false", verifyWebhookSignature(raw, good, "") === false);

// ── paymentEventKind ──
ok("payment_link.paid → link_paid", paymentEventKind("payment_link.paid") === "link_paid");
ok("payment_link.partially_paid → link_partial", paymentEventKind("payment_link.partially_paid") === "link_partial");
ok("payment.captured → payment_captured", paymentEventKind("payment.captured") === "payment_captured");
ok("payment.failed → null (ignored)", paymentEventKind("payment.failed") === null);
ok("payment_link.cancelled → null (ignored)", paymentEventKind("payment_link.cancelled") === null);
ok("empty → null", paymentEventKind("") === null);

// ── decidePaymentType (paise) ──
ok("paid == full → 'full'", decidePaymentType(3569900, 3569900, 500000) === "full");
ok("paid == advance (<full) → 'firstPayment'", decidePaymentType(500000, 3569900, 500000) === "firstPayment");
ok("advance == full → 'full' (not partial)", decidePaymentType(3569900, 3569900, 3569900) === "full");
ok("between → null (flag, never confirm)", decidePaymentType(2000000, 3569900, 500000) === null);
ok("zero → null", decidePaymentType(0, 3569900, 500000) === null);
ok("excess → null", decidePaymentType(4000000, 3569900, 500000) === null);

console.log(`\npaymentWebhook self-check: ${pass} assertions passed.`);
