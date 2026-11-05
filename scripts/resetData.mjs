// Controlled pre-launch data reset — DELETES all bookings + customer users only.
// Keeps Admin + Host users, trips, hosts, categories, settings, enquiries, reviews.
//
// SAFE BY DEFAULT:
//   node -r dotenv/config scripts/resetData.mjs            → DRY RUN (prints, deletes nothing)
//   RESET_CONFIRM=NUKE node -r dotenv/config scripts/resetData.mjs --execute --i-have-backup
//                                                          → actually deletes
//
// Irreversible. Run a mongodump FIRST (see docs/DATA_RESET_DRY_RUN.md).

import "dotenv/config";
import { connectDB } from "../database/db.js";
import { Bookings, User, Enquire } from "../models/index.js";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const HAVE_BACKUP = args.includes("--i-have-backup");
const INCLUDE_ENQUIRIES = args.includes("--enquiries"); // also delete ALL enquiries
const TOKEN_OK = process.env.RESET_CONFIRM === "NUKE";

const mask = (e) => (e || "").replace(/^(.{2}).*@/, "$1***@");
// Customers only. Admin + Host are operational and MUST survive.
const customerFilter = { role: { $nin: ["Admin", "Host"] } };

const run = async () => {
  await connectDB();

  const bookingsToDelete = await Bookings.countDocuments({});
  const usersToDelete = await User.countDocuments(customerFilter);
  const enquiriesToDelete = INCLUDE_ENQUIRIES ? await Enquire.countDocuments({}) : 0;
  const adminKept = await User.countDocuments({ role: "Admin" });
  const hostKept = await User.countDocuments({ role: "Host" });
  const sample = (await User.find(customerFilter).limit(5).lean()).map((u) => mask(u.email));

  console.log("── PRE-LAUNCH DATA RESET ──");
  console.log("WILL DELETE:");
  console.log("  bookings       :", bookingsToDelete, "(ALL)");
  console.log("  customer users :", usersToDelete, "sample:", sample);
  console.log("  enquiries      :", INCLUDE_ENQUIRIES ? `${enquiriesToDelete} (ALL)` : "0 (pass --enquiries to include)");
  console.log("WILL KEEP:");
  console.log("  Admin users    :", adminKept);
  console.log("  Host users     :", hostKept);
  console.log("  reviews, trips, hosts, categories, settings: UNTOUCHED");

  // Guards against an accidental over-delete.
  if (bookingsToDelete > 1000 || usersToDelete > 500) {
    console.error("ABORT: counts larger than expected — stop and re-verify.");
    process.exit(1);
  }
  if (adminKept < 1) {
    console.error("ABORT: this would leave zero Admin accounts.");
    process.exit(1);
  }

  if (!EXECUTE) {
    console.log("\nDRY RUN — nothing deleted.");
    console.log("To execute: RESET_CONFIRM=NUKE node -r dotenv/config scripts/resetData.mjs --execute --i-have-backup");
    process.exit(0);
  }
  if (!TOKEN_OK) {
    console.error("ABORT: set env RESET_CONFIRM=NUKE to execute.");
    process.exit(1);
  }
  if (!HAVE_BACKUP) {
    console.error("ABORT: take a mongodump first, then pass --i-have-backup.");
    process.exit(1);
  }

  const b = await Bookings.deleteMany({});
  const u = await User.deleteMany(customerFilter);
  const e = INCLUDE_ENQUIRIES ? await Enquire.deleteMany({}) : { deletedCount: 0 };
  console.log("\nDELETED → bookings:", b.deletedCount, "| customer users:", u.deletedCount, "| enquiries:", e.deletedCount);

  console.log("POST counts →",
    "bookings:", await Bookings.countDocuments({}),
    "| users total:", await User.countDocuments({}),
    "(Admin", await User.countDocuments({ role: "Admin" }),
    ", Host", await User.countDocuments({ role: "Host" }), ")");
  console.log("Done.");
  process.exit(0);
};

run().catch((e) => { console.error("RESET ERROR:", e?.message || e); process.exit(1); });
