// Standalone regression checks for the Payment Maintenance authorization core.
// Run: `node scripts/paymentGate.test.mjs`
//
// These cover the security invariants that do NOT need a DB: who may use the
// test sandbox, that production (no test env) disables it, and that callback
// verification picks the right key per booking mode. The DB-dependent decision
// path (maintenance toggle persistence, fail-closed on DB error) is exercised
// manually via the review checklist — there is no server test harness wired yet
// (no jest/mocha/vitest; package.json has no real `test` script).

import assert from "node:assert";

// Ensure a clean env for the "production" cases before importing the module.
delete process.env.PAYMENTS_TEST_MODE_ENABLED;
delete process.env.RAZORPAY_TEST_KEY_ID;
delete process.env.RAZORPAY_TEST_KEY_SECRET;
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "live_secret_stub";
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "live_id_stub";

const {
  isAuthorizedTestUser,
  isTestEnvReady,
  secretForMode,
  keysForMode,
  AUTHORIZED_TEST_EMAIL,
} = await import("../services/paymentAvailability.js");

let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); console.log("  ✓", name); pass++; };

console.log("Authorized test identity:");
ok("wrong email is rejected", isAuthorizedTestUser({ email: "someone@else.com", isVerified: true }) === false);
ok("right email but UNVERIFIED is rejected", isAuthorizedTestUser({ email: AUTHORIZED_TEST_EMAIL, isVerified: false }) === false);
ok("right email, verified, is accepted", isAuthorizedTestUser({ email: AUTHORIZED_TEST_EMAIL, isVerified: true }) === true);
ok("email is normalised (case + spaces)", isAuthorizedTestUser({ email: `  ${AUTHORIZED_TEST_EMAIL.toUpperCase()}  `, isVerified: true }) === true);
ok("no user is rejected", isAuthorizedTestUser(undefined) === false);
ok("email in body only (no isVerified) is rejected", isAuthorizedTestUser({ email: AUTHORIZED_TEST_EMAIL }) === false);

console.log("Test environment isolation (production has none):");
ok("no test keys => test env NOT ready (prod-safe)", isTestEnvReady() === false);

console.log("Callback key selection by booking mode:");
ok("live booking verifies with live secret", secretForMode("live") === process.env.RAZORPAY_KEY_SECRET);
ok("unknown/default mode verifies with live secret", secretForMode(undefined) === process.env.RAZORPAY_KEY_SECRET);
ok("test booking uses test secret (undefined here, never live)", secretForMode("test") !== process.env.RAZORPAY_KEY_SECRET);
ok("keysForMode(live) returns live id", keysForMode("live").key_id === process.env.RAZORPAY_KEY_ID);
ok("keysForMode(test) never returns live id", keysForMode("test").key_id !== process.env.RAZORPAY_KEY_ID);

console.log(`\nAll ${pass} checks passed.`);
