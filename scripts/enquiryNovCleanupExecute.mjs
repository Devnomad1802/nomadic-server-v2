// Phase B — scoped deletion of the 15 pre-November demo enquiry/host-message
// threads identified by the read-only dry-run (scripts/messageCleanupDryRun.mjs).
//
// Deletes ONLY the explicit IDs below — never a broad date query. Before
// deleting, each target is re-fetched and re-validated: it must still have NO
// activity on/after the cutoff. Any target that now carries a November message
// is SKIPPED (protected), so a conversation that gained a Nov reply after the
// dry-run can never be lost.
//
// SAFE BY DEFAULT:
//   node -r dotenv/config scripts/enquiryNovCleanupExecute.mjs
//        → DRY RUN. Re-validates, writes a backup of the targets, deletes NOTHING.
//   ENQ_CLEANUP_CONFIRM=DELETE node -r dotenv/config scripts/enquiryNovCleanupExecute.mjs --execute --i-have-backup
//        → inside a transaction: back up the targets, delete them, verify.
//
// Retention: Asia/Kolkata, cutoff 2026-11-01 00:00 IST = 2026-10-31T18:30:00Z.
// Idempotent: re-running after a successful delete finds 0 targets and no-ops.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDB } from "../database/db.js";
import { Enquire } from "../models/index.js";

const CUTOFF = new Date("2026-10-31T18:30:00.000Z");

// The 15 pre-November threads from the approved dry-run manifest. Explicit, per
// record — not derived from a date query at runtime.
const TARGET_IDS = [
  "6a22d30465e329d1708d4c6a",
  "6a2e441b417d762d00b11727",
  "6a3cf73e332025f28136244e",
  "6a3d0709332025f281362764",
  "6a4ea2e55f32b6715fe45693",
  "6a4fefc08029eb69c0ab1c4b",
  "6a5064898029eb69c0ab1ec3",
  "6a5068918029eb69c0ab1fd5",
  "6a50b5898029eb69c0ab3116",
  "6a5bbf4d102770750acd9269",
  "6a6670c7cb957ae92ac4be37",
  "6a6fbcdb333f9884091f40a4",
  "6a709ff647e31038e48e7bd2",
  "6a71e5caea3f1537f796cdc3",
  "6a8fe542db41f1c80b96ca1d",
];

const EXECUTE = process.argv.includes("--execute");
const HAVE_BACKUP = process.argv.includes("--i-have-backup");
const TOKEN_OK = process.env.ENQ_CLEANUP_CONFIRM === "DELETE";

const ms = (d) => { const t = new Date(d).getTime(); return isNaN(t) ? -Infinity : t; };
const hasNov = (e) =>
  ms(e.Date) >= CUTOFF.getTime() ||
  (e.chat || []).some((m) => ms(m.timeStamp) >= CUTOFF.getTime());

const run = async () => {
  await connectDB();

  const totalBefore = await Enquire.countDocuments();
  const targets = await Enquire.find({ _id: { $in: TARGET_IDS } }).lean();

  // Re-validation: drop any target that now has November activity (protect it).
  const safe = [];
  const protectedNow = [];
  for (const e of targets) {
    if (hasNov(e)) protectedNow.push(String(e._id));
    else safe.push(e);
  }
  const foundIds = new Set(targets.map((t) => String(t._id)));
  const alreadyGone = TARGET_IDS.filter((id) => !foundIds.has(id));

  console.log(`Total Enquire docs: ${totalBefore}`);
  console.log(`Targets requested:  ${TARGET_IDS.length}`);
  console.log(`  found:            ${targets.length}`);
  console.log(`  already deleted:  ${alreadyGone.length}`);
  console.log(`  now protected (gained Nov activity, will SKIP): ${protectedNow.length}`);
  if (protectedNow.length) console.log(`    ${protectedNow.join(", ")}`);
  console.log(`  to delete:        ${safe.length}`);
  console.log(`Expected remaining after delete: ${totalBefore - safe.length}\n`);

  // Always write a restorable backup of exactly what would be / is deleted.
  const dir = path.resolve("backups");
  fs.mkdirSync(dir, { recursive: true });
  const backupFile = path.join(dir, `enquiry-nov-cleanup-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(safe, null, 2));
  console.log(`Backup of ${safe.length} full docs written: ${backupFile}`);

  if (!EXECUTE) {
    console.log("\nDRY RUN — nothing deleted. Re-run with ENQ_CLEANUP_CONFIRM=DELETE --execute --i-have-backup to apply.");
    return process.exit(0);
  }
  if (!(TOKEN_OK && HAVE_BACKUP)) {
    console.log("\nRefused: need ENQ_CLEANUP_CONFIRM=DELETE, --execute AND --i-have-backup.");
    return process.exit(1);
  }
  if (safe.length === 0) {
    console.log("\nNothing to delete (already clean). No-op.");
    return process.exit(0);
  }

  const deleteIds = safe.map((e) => e._id);
  const session = await mongoose.startSession();
  try {
    let deleted = 0;
    await session.withTransaction(async () => {
      const r = await Enquire.deleteMany({ _id: { $in: deleteIds } }, { session });
      deleted = r.deletedCount;
    });
    const totalAfter = await Enquire.countDocuments();
    const novRemaining = await Enquire.countDocuments({
      $or: [{ Date: { $gte: CUTOFF } }, { "chat.timeStamp": { $gte: CUTOFF } }],
    });
    console.log(`\nDeleted: ${deleted}`);
    console.log(`Total Enquire docs now: ${totalAfter} (was ${totalBefore})`);
    console.log(`November docs still present: ${novRemaining}`);
    console.log(`Backup for rollback: ${backupFile}`);
  } finally {
    await session.endSession();
  }
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
