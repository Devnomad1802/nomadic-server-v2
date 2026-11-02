// Regression checks for mapPaymentsToState (payment-state integrity, Phase A).
// Run: `node scripts/reconcile.test.mjs`
import assert from "node:assert";
import { mapPaymentsToState } from "../controllers/Order.js";

let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); console.log("  ✓", name); pass++; };

ok("captured -> CAPTURED", mapPaymentsToState([{ status: "captured", id: "p1" }]).state === "CAPTURED");
ok("failed then captured -> CAPTURED", mapPaymentsToState([{ status: "failed" }, { status: "captured", id: "p2" }]).state === "CAPTURED");
ok("captured payment id returned", mapPaymentsToState([{ status: "captured", id: "p9" }]).payment.id === "p9");
ok("only authorized -> PENDING (held, not captured)", mapPaymentsToState([{ status: "authorized" }]).state === "PENDING");
ok("all failed -> FAILED", mapPaymentsToState([{ status: "failed" }, { status: "failed" }]).state === "FAILED");
ok("empty -> PENDING (no false failure)", mapPaymentsToState([]).state === "PENDING");
ok("created only -> PENDING", mapPaymentsToState([{ status: "created" }]).state === "PENDING");
ok("non-array -> PENDING", mapPaymentsToState(undefined).state === "PENDING");

console.log(`\nAll ${pass} checks passed.`);
