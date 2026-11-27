// DB-free self-check for chat-notification email safety (Slice 1).
// Guarantees the excerpt is HTML-escaped (no XSS in the notification email),
// truncated, and the recipient address is masked before it is stored.
//
// Run: node test_examples/chatNotify.selfcheck.mjs
import assert from "node:assert/strict";
import { esc, excerptOf, maskEmail } from "../services/chatNotifications.js";

let pass = 0;
const ok = (label, cond) => { assert.ok(cond, label); console.log("  ✓ " + label); pass++; };

// ── HTML escaping (XSS guard) ──
ok("escapes <script>", esc('<script>alert(1)</script>') === "&lt;script&gt;alert(1)&lt;/script&gt;");
ok("escapes quotes + amp", esc(`a&b"c'd`) === "a&amp;b&quot;c&#39;d");
ok("empty-safe", esc(null) === "" && esc(undefined) === "");

// ── excerpt truncation + whitespace collapse ──
ok("collapses whitespace", excerptOf("hi   there\n\nyou") === "hi there you");
const long = "x".repeat(300);
ok("truncates to <=140 with ellipsis", excerptOf(long).length === 140 && excerptOf(long).endsWith("…"));
ok("short passes through", excerptOf("short") === "short");

// ── recipient masking (never store raw address) ──
ok("masks local part, keeps domain", maskEmail("john.doe@example.com") === "j***@example.com");
ok("masks short", maskEmail("a@b.com") === "a***@b.com");
ok("no-at → ***", maskEmail("notanemail") === "***");
ok("empty → empty", maskEmail("") === "");

console.log(`\nchatNotify.selfcheck: ${pass} checks passed`);
