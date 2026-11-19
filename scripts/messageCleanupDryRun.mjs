// READ-ONLY inventory + deletion dry-run for historical demo enquiries / host
// messages. Enquiries (admin → Enquiries) and host messages (admin → Host
// Messages) are the SAME `Enquire` collection, so this one audit covers both.
//
// WRITES NOTHING. There is no delete/archive code path here by design — this
// only classifies and exports a manifest for owner review. Destructive cleanup
// is a separate, approval-gated step.
//
//   node -r dotenv/config scripts/messageCleanupDryRun.mjs
//
// Retention policy (owner-confirmed):
//   • Business timezone: Asia/Kolkata (UTC+5:30, no DST).
//   • Cutoff: 2026-11-01 00:00 IST  ==  2026-10-31T18:30:00Z.
//   • PRESERVE every doc that has ANY activity on/after the cutoff, including a
//     November message inside an older thread — keep the whole container.
//   • Only docs whose newest activity is before the cutoff are cleanup
//     candidates. Uncertain ones are marked REVIEW, never auto-DELETE.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { connectDB } from "../database/db.js";
import { Enquire } from "../models/index.js";

const CUTOFF = new Date("2026-10-31T18:30:00.000Z"); // 2026-11-01 00:00 IST
const IST = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
const ms = (d) => { const t = new Date(d).getTime(); return isNaN(t) ? -Infinity : t; };

// Demo/test heuristics — mark REVIEW (not DELETE) when unsure.
const DEMO_HINTS = [/test/i, /demo/i, /sample/i, /dummy/i, /asdf/i, /qwerty/i];
const looksDemo = (e) => {
  const hay = `${e.Name ?? ""} ${e.Email ?? ""} ${e.Message ?? ""}`;
  return DEMO_HINTS.some((re) => re.test(hay)) || e.source === "booking_fallback";
};

const run = async () => {
  await connectDB();
  const all = await Enquire.find().lean();
  console.log(`Scanning ${all.length} Enquire docs (enquiries + host messages).`);
  console.log(`Cutoff: ${CUTOFF.toISOString()} (2026-11-01 00:00 IST)\n`);

  const manifest = [];
  let protectedNov = 0, candidates = 0, review = 0;

  for (const e of all) {
    const stamps = [ms(e.Date), ...(e.chat || []).map((m) => ms(m.timeStamp))];
    const newest = Math.max(...stamps);
    const hasNov = stamps.some((t) => t >= CUTOFF.getTime());
    const novMsgs = (e.chat || []).filter((m) => ms(m.timeStamp) >= CUTOFF.getTime()).length;
    const preNovMsgs = (e.chat || []).length - novMsgs;

    let cls;
    if (hasNov) { cls = "PROTECTED_NOV"; protectedNov++; }
    else if (looksDemo(e)) { cls = "PRE_NOV_DEMO_CANDIDATE"; candidates++; }
    else { cls = "PRE_NOV_REVIEW"; review++; }

    manifest.push({
      id: String(e._id),
      class: cls,
      hostId: e.hostId ? String(e.hostId) : null,
      customer: (e.Name || "—").slice(0, 1) + "***", // redacted
      source: e.source || "—",
      messages: (e.chat || []).length,
      novMessages: novMsgs,
      preNovMessages: preNovMsgs,
      newestActivityIST: newest > -Infinity ? IST(newest) : "—",
    });
  }

  console.log(`PROTECTED_NOV (keep, has Nov activity):   ${protectedNov}`);
  console.log(`PRE_NOV_DEMO_CANDIDATE (propose cleanup): ${candidates}`);
  console.log(`PRE_NOV_REVIEW (manual check, DO NOT auto):${review}\n`);
  console.log("Sample (first 25):");
  for (const r of manifest.slice(0, 25)) {
    console.log(`  ${r.class.padEnd(24)} ${r.id}  msgs=${r.messages} nov=${r.novMessages}  last=${r.newestActivityIST}`);
  }

  const dir = path.resolve("reports/seo".replace("seo", "cleanup"));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `message-cleanup-manifest-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ cutoff: CUTOFF.toISOString(), protectedNov, candidates, review, manifest }, null, 2));
  console.log(`\nManifest written: ${file}`);
  console.log("READ-ONLY — nothing deleted. Review the manifest, then approve a scoped cleanup.");
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
