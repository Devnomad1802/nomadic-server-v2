// DB-free self-check for the admin Add-Customer guards. Guarantees identifiers
// are normalised and that an existing email is reused (never duplicated) while
// a phone owned by a different account is flagged for manual resolution — never
// silently merged.
//
// Run: node test_examples/customer.selfcheck.mjs
import assert from "node:assert/strict";
import {
  normalizeEmail,
  normalizePhone,
  isValidEmail,
  isValidPhone,
  classifyCustomerConflict,
} from "../controllers/customers.js";

let pass = 0;
const ok = (label, cond) => { assert.ok(cond, label); console.log("  ✓ " + label); pass++; };

// ── normalisation ──
ok("email trimmed + lowercased", normalizeEmail("  Foo@Bar.COM ") === "foo@bar.com");
ok("phone keeps + and digits only", normalizePhone("+91 98765-43210") === "+919876543210");
ok("phone without + keeps digits", normalizePhone("098765 43210") === "09876543210");
ok("phone junk → empty", normalizePhone("abc") === "");

// ── validation ──
ok("valid email", isValidEmail("a@b.com"));
ok("invalid email rejected", !isValidEmail("nope"));
ok("valid phone (>=8 digits)", isValidPhone("+919876543210"));
ok("short phone rejected", !isValidPhone("123"));

// ── conflict classification ──
ok("existing email → EMAIL_EXISTS (reuse, never dup)", classifyCustomerConflict({ _id: "a" }, null).code === "EMAIL_EXISTS");
ok("phone owned elsewhere → PHONE_CONFLICT (manual)", classifyCustomerConflict(null, { _id: "b" }).code === "PHONE_CONFLICT");
ok("email takes precedence over phone", classifyCustomerConflict({ _id: "a" }, { _id: "b" }).code === "EMAIL_EXISTS");
ok("no matches → ok to create", classifyCustomerConflict(null, null).ok === true);

console.log(`\ncustomer self-check: ${pass} assertions passed.`);
