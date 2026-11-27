// DB-free self-check for HOST B2B earnings (not customer retail).
// Guarantees: host revenue is the agreed B2B entitlement summed from the
// immutable booking snapshot; a booking whose snapshot lacks B2B for any
// selected option is UNKNOWN (null) — never 0, never the retail price.
//
// Run: node test_examples/hostEarning.selfcheck.mjs
import assert from "node:assert/strict";
import { hostEarningOf, hostEarningTotal } from "../utils/bookingRevenue.js";

let pass = 0;
const ok = (label, cond) => { assert.ok(cond, label); console.log("  ✓ " + label); pass++; };

const snap = (items) => ({ cardData: JSON.stringify({ cardSectionData: items }) });

// ── hostEarningOf: B2B × qty from the snapshot ──
ok("single option: 30000 × 1 = 30000", hostEarningOf(snap([{ hostB2BPrice: 30000, quantity: 1 }])) === 30000);
ok("qty multiplies: 30000 × 2 = 60000", hostEarningOf(snap([{ hostB2BPrice: 30000, quantity: 2 }])) === 60000);
ok("multiple options sum", hostEarningOf(snap([{ hostB2BPrice: 30000, quantity: 2 }, { hostB2BPrice: 5000, quantity: 1 }])) === 65000);
ok("retail is NOT used (B2B 30000 even if a TitlePrice 34500 present)", hostEarningOf(snap([{ hostB2BPrice: 30000, TitlePrice: "34500", quantity: 1 }])) === 30000);

// ── UNKNOWN (null) — never 0, never retail ──
ok("missing B2B on an option → null (unknown)", hostEarningOf(snap([{ hostB2BPrice: 30000, quantity: 1 }, { TitlePrice: "5000", quantity: 1 }])) === null);
ok("blank/zero B2B → null", hostEarningOf(snap([{ hostB2BPrice: 0, quantity: 1 }])) === null);
ok("empty snapshot → null", hostEarningOf(snap([])) === null);
ok("no cardData → null", hostEarningOf({}) === null);
ok("broken cardData → null", hostEarningOf({ cardData: "{not json" }) === null);

// ── hostEarningTotal across earning bookings only ──
const E = (items) => ({ paymentStatus: "fullPayment", ...snap(items) });
const bookings = [
  E([{ hostB2BPrice: 30000, quantity: 1 }]),            // known 30000
  E([{ hostB2BPrice: 5000, quantity: 2 }]),             // known 10000
  E([{ TitlePrice: "9999", quantity: 1 }]),             // earning but no B2B → unreconciled
  { paymentStatus: "created", ...snap([{ hostB2BPrice: 99999, quantity: 1 }]) }, // attempt → ignored
  { paymentStatus: "cancelled", ...snap([{ hostB2BPrice: 99999, quantity: 1 }]) }, // dead → ignored
];
const tot = hostEarningTotal(bookings);
ok("earning sum = 40000 (known only)", tot.earning === 40000);
ok("unreconciled = 1 (earning w/o B2B)", tot.unreconciled === 1);
ok("attempts & cancelled never counted", tot.earning === 40000 && tot.unreconciled === 1);

console.log(`\nhostEarning.selfcheck: ${pass} checks passed`);
