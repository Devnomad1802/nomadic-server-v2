import assert from "node:assert";
import { computeSelling, sellingRupees, parseSections, recomputeSections } from "../utils/tripPricing.js";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ✓", n); pass++; };

// ── computeSelling (paise-safe) ──
assert.equal(sellingRupees(30000, 15), 34500); ok("30000 +15% = 34500", true);
assert.equal(sellingRupees(25999, 15), 29898.85); ok("25999 +15% = 29898.85 (paise-exact)", true);
assert.equal(sellingRupees(1000, 0), 1000); ok("0% markup = B2B", true);
assert.equal(computeSelling("", 15).ok, false); ok("blank B2B → not ok", true);
assert.equal(computeSelling(-5, 15).ok, false); ok("negative B2B → not ok", true);
assert.equal(computeSelling(1000, "").ok, false); ok("blank markup → not ok", true);
assert.equal(computeSelling(1000, -3).ok, false); ok("negative markup → not ok", true);

// ── parseSections tolerant ──
assert.deepEqual(parseSections('[{"a":1}]'), [{ a: 1 }]); ok("parses JSON string", true);
assert.deepEqual(parseSections([{ a: 1 }]), [{ a: 1 }]); ok("passes through array", true);
assert.deepEqual(parseSections("not json"), []); ok("junk string → []", true);
assert.deepEqual(parseSections(null), []); ok("null → []", true);

// ── recomputeSections ──
const base = [{
  section: 1, sectionTitle: "Category",
  array: [
    { Title: "Curated Shared Dorm Bed", TitlePrice: "25999" },              // legacy, no B2B
    { Title: "Dedicated Private Room", TitlePrice: "33999", hostB2BPrice: "30000" },
  ],
}];

// 1. Legacy row (no B2B) keeps its selling price; B2B row recomputes at 15%.
let r = recomputeSections(base, 15);
assert.equal(r[0].array[0].TitlePrice, "25999"); ok("legacy row selling preserved", true);
assert.equal(r[0].array[1].TitlePrice, "34500"); ok("B2B row recomputed to 34500", true);
assert.equal(r[0].array[1].markupRate, 15); ok("B2B row stamps markupRate 15", true);
assert.equal(r[0].sectionTitle, "Category"); ok("section title preserved", true);
assert.equal(r[0].array[0].Title, "Curated Shared Dorm Bed"); ok("option label preserved", true);

// 2. Client-supplied TitlePrice on a B2B row is OVERWRITTEN (not trusted).
const spoof = [{ section: 1, sectionTitle: "X", array: [{ Title: "A", TitlePrice: "1", hostB2BPrice: "100" }] }];
assert.equal(recomputeSections(spoof, 10)[0].array[0].TitlePrice, "110"); ok("spoofed selling overwritten by server compute", true);

// 3. Order preserved across multiple options.
const multi = [{ section: 1, sectionTitle: "S", array: [
  { Title: "one", hostB2BPrice: "100" }, { Title: "two", hostB2BPrice: "200" }, { Title: "three", TitlePrice: "999" },
] }];
const rm = recomputeSections(multi, 50);
assert.deepEqual(rm[0].array.map((i) => i.Title), ["one", "two", "three"]); ok("option order preserved", true);
assert.equal(rm[0].array[0].TitlePrice, "150"); ok("one → 150", true);
assert.equal(rm[0].array[1].TitlePrice, "300"); ok("two → 300", true);
assert.equal(rm[0].array[2].TitlePrice, "999"); ok("three legacy kept", true);

// 4. Missing host rate: B2B row can't compute → legacy TitlePrice kept, no fabricated price.
const noRate = [{ section: 1, sectionTitle: "S", array: [{ Title: "A", TitlePrice: "500", hostB2BPrice: "100" }] }];
assert.equal(recomputeSections(noRate, "")[0].array[0].TitlePrice, "500"); ok("no host rate → legacy selling kept, none fabricated", true);

// 5. Accepts JSON string input (as the client sends it).
assert.equal(recomputeSections(JSON.stringify(base), 15)[0].array[1].TitlePrice, "34500"); ok("accepts stringified sections", true);

// 6. Empty/garbage → [].
assert.deepEqual(recomputeSections("", 15), []); ok("empty → []", true);

console.log(`\n${pass} passed`);
