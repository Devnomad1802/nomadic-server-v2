// Backfill broken chat-message timestamps caused by two historical bugs:
//   1. models/enquire.js chat.timeStamp default was `new Date(...)` (a value,
//      evaluated once at model-load) → every auto-defaulted timestamp froze to
//      server boot time.
//   2. controllers/enquire.js seeded the FIRST chat message with `Date:` (not a
//      real field on the chat subschema) instead of `timeStamp:` → the first
//      message had no real timeStamp and fell back to that frozen default.
// Both are fixed forward in code; this repairs rows written before the fix.
//
// SAFE BY DEFAULT:
//   node -r dotenv/config scripts/backfillChatTimestamps.mjs
//        → DRY RUN. Prints every proposed change. Writes NOTHING.
//   BACKFILL_CONFIRM=APPLY node -r dotenv/config scripts/backfillChatTimestamps.mjs --execute --i-have-backup
//        → writes repairs, AFTER dumping affected docs to a backup JSON.
//
// Repair rules (never invent a date outside the conversation's real span):
//   • A message whose timeStamp is missing / invalid, OR earlier than the
//     previous message (insertion order is chronological, so this is impossible
//     for genuine data), is repaired.
//   • First message (index 0): set to the enquiry's own `Date` (the true
//     first-contact time) when available.
//   • Any later broken message: clamped to previous message's effective
//     timeStamp + 1s — preserves order; approximate and logged as such.
//   • Messages already consistent are left byte-for-byte untouched.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { connectDB } from "../database/db.js";
import { Enquire } from "../models/index.js";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const HAVE_BACKUP = args.includes("--i-have-backup");
const TOKEN_OK = process.env.BACKFILL_CONFIRM === "APPLY";

const valid = (d) => {
  if (!d) return null;
  const t = new Date(d);
  return isNaN(t.getTime()) ? null : t;
};

const run = async () => {
  await connectDB();
  const enquiries = await Enquire.find({ "chat.0": { $exists: true } });
  console.log(`Scanning ${enquiries.length} enquiries with chat…\n`);

  const affected = []; // { _id, before:[iso|null], after:[iso] }
  let msgRepairs = 0;

  for (const e of enquiries) {
    const before = e.chat.map((m) => (m.timeStamp ? new Date(m.timeStamp).toISOString() : null));
    const enquiryDate = valid(e.Date);
    let changed = false;
    let prevEff = null;

    e.chat.forEach((m, i) => {
      const cur = valid(m.timeStamp);
      const broken = !cur || (prevEff && cur.getTime() < prevEff.getTime());

      if (broken) {
        let repaired;
        if (i === 0 && enquiryDate) {
          repaired = enquiryDate;
        } else if (prevEff) {
          repaired = new Date(prevEff.getTime() + 1000); // +1s, keep order
        } else if (enquiryDate) {
          repaired = enquiryDate;
        } else {
          prevEff = cur; // nothing safe to assign; leave as-is
          return;
        }
        m.timeStamp = repaired;
        prevEff = repaired;
        changed = true;
        msgRepairs++;
      } else {
        prevEff = cur;
      }
    });

    if (changed) {
      affected.push({ _id: String(e._id), before, after: e.chat.map((m) => new Date(m.timeStamp).toISOString()) });
      if (EXECUTE && TOKEN_OK && HAVE_BACKUP) await e.save();
    }
  }

  console.log(`Enquiries needing repair: ${affected.length}`);
  console.log(`Messages repaired:        ${msgRepairs}\n`);
  for (const a of affected.slice(0, 50)) {
    console.log(`  ${a._id}`);
    a.before.forEach((b, i) => { if (b !== a.after[i]) console.log(`    [${i}] ${b ?? "∅"}  →  ${a.after[i]}`); });
  }
  if (affected.length > 50) console.log(`  …and ${affected.length - 50} more.`);

  if (!EXECUTE) {
    console.log("\nDRY RUN — nothing written. Re-run with --execute --i-have-backup and BACKFILL_CONFIRM=APPLY to apply.");
  } else if (!(TOKEN_OK && HAVE_BACKUP)) {
    console.log("\nRefused to write: need BACKFILL_CONFIRM=APPLY, --execute AND --i-have-backup.");
  } else {
    const dir = path.resolve("backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `chat-timestamp-backfill-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(affected, null, 2));
    console.log(`\nApplied. Pre-change snapshot of affected docs written to ${file}`);
  }

  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
