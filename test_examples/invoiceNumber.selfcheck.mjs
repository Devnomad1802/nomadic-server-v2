// Standalone self-check for the FY invoice-number logic (no DB, no network).
// Run: node test_examples/invoiceNumber.selfcheck.mjs
// Exercises the PURE functions only — nextInvoiceNumber() needs Mongo and is
// covered by the atomic $inc contract, not here.
import assert from "node:assert/strict";
import { fyLabel, formatInvoiceNumber, invoiceFileName } from "../utils/invoiceNumber.js";

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("  ✓", name); };

console.log("fyLabel (Asia/Kolkata, FY starts 1 April IST):");
ok("Nov 2026 → 26-27", () => assert.equal(fyLabel(new Date("2026-11-26T09:00:00Z")), "26-27"));
ok("Jan 2027 → 26-27", () => assert.equal(fyLabel(new Date("2027-01-15T09:00:00Z")), "26-27"));
ok("Apr 2027 → 27-28", () => assert.equal(fyLabel(new Date("2027-04-01T09:00:00Z")), "27-28"));
// IST boundary: 18:00Z = 23:30 IST on 31 Mar (still FY 25-26);
//               19:00Z = 00:30 IST on 1 Apr (now FY 26-27).
ok("31 Mar 23:30 IST → 25-26", () => assert.equal(fyLabel(new Date("2026-03-31T18:00:00Z")), "25-26"));
ok("1 Apr 00:30 IST → 26-27", () => assert.equal(fyLabel(new Date("2026-03-31T19:00:00Z")), "26-27"));

console.log("formatInvoiceNumber:");
ok("live seq 1 → NT/26-27/0001", () => assert.equal(formatInvoiceNumber({ seq: 1, fy: "26-27", dev: false }), "NT/26-27/0001"));
ok("test seq 1 → NTT/26-27/0001", () => assert.equal(formatInvoiceNumber({ seq: 1, fy: "26-27", dev: true }), "NTT/26-27/0001"));
ok("live seq 12345 grows, no truncation", () => assert.equal(formatInvoiceNumber({ seq: 12345, fy: "26-27", dev: false }), "NT/26-27/12345"));
ok("live length ≤ 16 at 7-digit seq", () => assert.ok(formatInvoiceNumber({ seq: 1000000, fy: "26-27", dev: false }).length <= 16));
ok("live/test series never collide", () => assert.notEqual(
  formatInvoiceNumber({ seq: 1, fy: "26-27", dev: false }),
  formatInvoiceNumber({ seq: 1, fy: "26-27", dev: true })));

console.log("invoiceFileName (filename-safe, no slashes):");
ok("NT/26-27/0001 → NT-26-27-0001.pdf", () => assert.equal(invoiceFileName("NT/26-27/0001"), "NT-26-27-0001.pdf"));
ok("no slash remains", () => assert.ok(!invoiceFileName("NT/26-27/0001").includes("/")));
ok("null-safe", () => assert.equal(invoiceFileName(null), "invoice.pdf"));

console.log(`\nAll ${n} checks passed.`);
