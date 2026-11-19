// Rollback for enquiryNovCleanupExecute.mjs — re-inserts the deleted docs from
// a backup JSON written by that script. Idempotent: docs that already exist are
// skipped (insert only the missing ones).
//
//   node -r dotenv/config scripts/enquiryNovCleanupRestore.mjs backups/enquiry-nov-cleanup-<ts>.json
//
// Read-only unless the file is given AND --execute is passed.

import "dotenv/config";
import fs from "node:fs";
import { connectDB } from "../database/db.js";
import { Enquire } from "../models/index.js";

const file = process.argv.find((a) => a.endsWith(".json"));
const EXECUTE = process.argv.includes("--execute");

const run = async () => {
  if (!file) { console.log("Pass the backup JSON path."); return process.exit(1); }
  const docs = JSON.parse(fs.readFileSync(file, "utf8"));
  await connectDB();
  const ids = docs.map((d) => d._id);
  const existing = new Set((await Enquire.find({ _id: { $in: ids } }).select("_id").lean()).map((d) => String(d._id)));
  const missing = docs.filter((d) => !existing.has(String(d._id)));

  console.log(`Backup docs: ${docs.length} · already present: ${existing.size} · to restore: ${missing.length}`);
  if (!EXECUTE) { console.log("DRY RUN — pass --execute to re-insert."); return process.exit(0); }
  if (missing.length === 0) { console.log("Nothing to restore."); return process.exit(0); }

  const r = await Enquire.insertMany(missing, { ordered: false });
  console.log(`Restored ${r.length} docs.`);
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
