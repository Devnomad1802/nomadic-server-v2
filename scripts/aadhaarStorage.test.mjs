import assert from "node:assert";
import {
  sniffImageType,
  mergeAadhaarDocs,
  sideField,
  AADHAAR_SIDES,
} from "../utils/aadhaarStorage.js";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ✓", n); pass++; };

// ── sniffImageType: real bytes, not extension/mime ──
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const pdf = Buffer.from("%PDF-1.4 ...............", "ascii");
const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>", "ascii");
const tiny = Buffer.from([0xff, 0xd8]);

assert.equal(sniffImageType(jpeg), "image/jpeg"); ok("JPEG magic → image/jpeg", true);
assert.equal(sniffImageType(png), "image/png"); ok("PNG magic → image/png", true);
assert.equal(sniffImageType(webp), "image/webp"); ok("WebP magic → image/webp", true);
assert.equal(sniffImageType(pdf), null); ok("PDF rejected (null)", true);
assert.equal(sniffImageType(svg), null); ok("SVG rejected (null)", true);
assert.equal(sniffImageType(tiny), null); ok("too-short buffer rejected", true);
assert.equal(sniffImageType(null), null); ok("null buffer rejected", true);
// A .jpg-named file whose bytes are actually a PDF must still fail.
assert.equal(sniffImageType(pdf), null); ok("spoofed extension can't pass (bytes win)", true);

// ── sideField / AADHAAR_SIDES ──
assert.equal(sideField("front"), "aadhaarFront"); ok("front → aadhaarFront", true);
assert.equal(sideField("back"), "aadhaarBack"); ok("back → aadhaarBack", true);
assert.equal(sideField("middle"), null); ok("invalid side → null", true);
assert.deepEqual(AADHAAR_SIDES, ["front", "back"]); ok("sides are front,back", true);

// ── mergeAadhaarDocs: preserve untouched side, report replaced keys ──
// 1. Upload front only → back preserved, nothing replaced.
let r = mergeAadhaarDocs(
  { panCard: "pub/pan.jpg", aadhaarBack: "priv/back1" },
  { aadhaarFront: "priv/front1" }
);
assert.equal(r.documents.aadhaarFront, "priv/front1");
assert.equal(r.documents.aadhaarBack, "priv/back1"); // untouched
assert.equal(r.documents.panCard, "pub/pan.jpg"); // other docs intact
assert.deepEqual(r.replacedKeys, []);
ok("upload front only preserves back + other docs", true);

// 2. Replace existing front → old front key returned for deletion.
r = mergeAadhaarDocs(
  { aadhaarFront: "priv/old", aadhaarBack: "priv/back1" },
  { aadhaarFront: "priv/new" }
);
assert.equal(r.documents.aadhaarFront, "priv/new");
assert.equal(r.documents.aadhaarBack, "priv/back1");
assert.deepEqual(r.replacedKeys, ["priv/old"]);
ok("replacing a side returns old key + keeps the other side", true);

// 3. Same key re-sent → not counted as replaced.
r = mergeAadhaarDocs({ aadhaarFront: "priv/x" }, { aadhaarFront: "priv/x" });
assert.deepEqual(r.replacedKeys, []);
ok("identical key is not a replacement", true);

// 4. Both sides fresh onto empty docs.
r = mergeAadhaarDocs(undefined, { aadhaarFront: "f", aadhaarBack: "b" });
assert.equal(r.documents.aadhaarFront, "f");
assert.equal(r.documents.aadhaarBack, "b");
assert.deepEqual(r.replacedKeys, []);
ok("both sides onto empty documents", true);

// 5. Empty upload → documents unchanged.
r = mergeAadhaarDocs({ aadhaarFront: "f" }, {});
assert.equal(r.documents.aadhaarFront, "f");
assert.deepEqual(r.replacedKeys, []);
ok("empty upload leaves documents unchanged", true);

console.log(`\n${pass} passed`);
