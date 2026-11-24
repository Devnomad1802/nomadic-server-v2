import assert from "node:assert";
import {
  canTransition,
  isApprovalLive,
  computeExpiry,
  withinScope,
  REAPPLY_FROM,
  ACTIVE_STATES,
  TERMINAL_STATES,
  DEFAULT_EXPIRY_HOURS,
} from "../services/approvalGate.js";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ✓", n); pass++; };

// ── canTransition: allowed ──
ok("pending→approved", canTransition("pending", "approved"));
ok("pending→declined", canTransition("pending", "declined"));
ok("pending→withdrawn", canTransition("pending", "withdrawn"));
ok("approved→booked", canTransition("approved", "booked"));
ok("approved→revoked", canTransition("approved", "revoked"));
ok("approved→expired", canTransition("approved", "expired"));
ok("call_scheduled→approved", canTransition("call_scheduled", "approved"));

// ── canTransition: rejected ──
ok("declined→approved blocked", !canTransition("declined", "approved"));
ok("booked→approved blocked (terminal)", !canTransition("booked", "approved"));
ok("booked→revoked blocked", !canTransition("booked", "revoked"));
ok("expired→booked blocked", !canTransition("expired", "booked"));
ok("withdrawn→approved blocked", !canTransition("withdrawn", "approved"));
ok("pending→booked blocked (must approve first)", !canTransition("pending", "booked"));
ok("same-state blocked", !canTransition("approved", "approved"));
ok("unknown state blocked", !canTransition("bogus", "approved"));

// ── isApprovalLive ──
const future = new Date(Date.now() + 3600_000);
const past = new Date(Date.now() - 3600_000);
ok("approved + future expiry = live", isApprovalLive({ status: "approved", expiresAt: future }));
ok("approved + past expiry = not live", !isApprovalLive({ status: "approved", expiresAt: past }));
ok("approved + no expiry = not live", !isApprovalLive({ status: "approved", expiresAt: null }));
ok("pending never live", !isApprovalLive({ status: "pending", expiresAt: future }));
ok("booked not live (already used)", !isApprovalLive({ status: "booked", expiresAt: future }));
ok("null app not live", !isApprovalLive(null));

// ── computeExpiry ──
const t0 = new Date("2026-01-01T00:00:00.000Z");
assert.equal(computeExpiry(t0).toISOString(), "2026-01-03T00:00:00.000Z");
ok("default expiry = +48h UTC", true);
assert.equal(computeExpiry(t0, 24).toISOString(), "2026-01-02T00:00:00.000Z");
ok("custom 24h expiry", true);
ok("DEFAULT_EXPIRY_HOURS is 48", DEFAULT_EXPIRY_HOURS === 48);

// ── withinScope ──
const appScope = { batchIndex: 2, partySize: 4 };
ok("same batch, equal party = in scope", withinScope(appScope, { batchIndex: 2, partySize: 4 }));
ok("same batch, smaller party = in scope", withinScope(appScope, { batchIndex: 2, partySize: 2 }));
ok("same batch, larger party = out of scope", !withinScope(appScope, { batchIndex: 2, partySize: 5 }));
ok("different batch = out of scope", !withinScope(appScope, { batchIndex: 1, partySize: 1 }));
ok("batch 0 vs undefined treated equal", withinScope({ batchIndex: 0, partySize: 1 }, { partySize: 1 }));
ok("null app = out of scope", !withinScope(null, { batchIndex: 0, partySize: 1 }));

// ── state sets integrity ──
ok("REAPPLY_FROM excludes active states", REAPPLY_FROM.every((s) => !ACTIVE_STATES.includes(s)));
ok("booked is both active-ish and terminal", ACTIVE_STATES.includes("booked") && TERMINAL_STATES.includes("booked"));
ok("REAPPLY_FROM = declined/expired/revoked/withdrawn", REAPPLY_FROM.join(",") === "declined,expired,revoked,withdrawn");

console.log(`\n${pass} checks passed.`);
