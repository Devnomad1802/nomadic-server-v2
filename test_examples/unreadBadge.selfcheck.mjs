// DB-free self-check for the unread-badge display cap.
// Run: node test_examples/unreadBadge.selfcheck.mjs
import assert from "node:assert/strict";
import { capUnreadDisplay } from "../controllers/hostChat.js";

let pass = 0;
const ok = (label, cond) => { assert.ok(cond, label); console.log("  ✓ " + label); pass++; };

ok("0 → '0' (caller hides badge)", capUnreadDisplay(0) === "0");
ok("5 → '5'", capUnreadDisplay(5) === "5");
ok("99 → '99'", capUnreadDisplay(99) === "99");
ok("100 → '99+'", capUnreadDisplay(100) === "99+");
ok("9999 → '99+'", capUnreadDisplay(9999) === "99+");
ok("negative → '0'", capUnreadDisplay(-3) === "0");
ok("garbage → '0'", capUnreadDisplay(undefined) === "0" && capUnreadDisplay("x") === "0");
ok("float floored", capUnreadDisplay(4.9) === "4");

console.log(`\nunreadBadge.selfcheck: ${pass} checks passed`);
