// DB-free self-check for redactTripPricing — ensures private host B2B cost and
// markup never survive on a customer-facing trip response, while the public
// selling price (TitlePrice) and everything else is preserved.
//
// Run: node test_examples/redactTripPricing.selfcheck.mjs
import assert from "node:assert/strict";
import { redactTripPricing } from "../controllers/trips.js";

let pass = 0;
const ok = (label, cond) => { assert.ok(cond, label); console.log("  ✓ " + label); pass++; };

// 1. Normal case: strips hostB2BPrice + markupRate, keeps TitlePrice/Title.
{
  const addsection = JSON.stringify([
    { sectionTitle: "Stay", array: [
      { Title: "Dorm", hostB2BPrice: "17509", markupRate: 15, TitlePrice: "20499" },
      { Title: "Private", hostB2BPrice: "26000", markupRate: 15, TitlePrice: "29999" },
    ] },
  ]);
  const t = redactTripPricing({ _id: "x", price: "20499", addsection });
  const out = JSON.parse(t.addsection);
  ok("hostB2BPrice removed", !/hostB2BPrice/.test(t.addsection));
  ok("markupRate removed", !/markupRate/.test(t.addsection));
  ok("TitlePrice preserved", out[0].array[0].TitlePrice === "20499" && out[0].array[1].TitlePrice === "29999");
  ok("Title preserved", out[0].array[0].Title === "Dorm");
  ok("sectionTitle preserved", out[0].sectionTitle === "Stay");
  ok("other trip fields untouched", t.price === "20499");
}

// 2. Empty / falsey addsection values pass through unchanged.
for (const v of ["", "false", "[]"]) {
  const t = redactTripPricing({ addsection: v });
  ok(`addsection "${v}" unchanged`, t.addsection === v);
}

// 3. Missing addsection → no throw, object returned.
{
  const t = redactTripPricing({ _id: "y" });
  ok("missing addsection handled", t && t._id === "y");
}

// 4. Unparseable JSON that contains private keys → field dropped, never leaked.
{
  const t = redactTripPricing({ addsection: '{broken hostB2BPrice: 17509' });
  ok("unparseable+private → dropped to []", t.addsection === "[]");
}

// 5. Null / non-object inputs don't throw.
ok("null input", redactTripPricing(null) === null);
ok("string input", redactTripPricing("nope") === "nope");

console.log(`\nAll ${pass} checks passed.`);
