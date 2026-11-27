// READ-ONLY migration dry-run. Makes NO writes, NO index changes.
// Run on the droplet BEFORE adding any UNIQUE index for assisted/imported
// payments. It reports whether the production data already contains duplicates
// that a unique constraint would reject.
//
//   cd /root/nomadic-server-v2 && node scripts/import-dedupe-dryrun.mjs
//
// Exit 0 always (reporting tool). Prints counts only — no PII values.
import "dotenv/config";
import mongoose from "mongoose";

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI not set — aborting (no connection made).");
  process.exit(1);
}

const dupGroups = async (coll, field, match = {}) =>
  coll
    .aggregate([
      { $match: { [field]: { $nin: [null, ""] }, ...match } },
      { $group: { _id: `$${field}`, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $count: "groups" },
    ])
    .toArray()
    .then((r) => r?.[0]?.groups || 0);

(async () => {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const bookings = db.collection("bookings");
  const users = db.collection("users");

  console.log("── Import dedupe dry-run (READ ONLY) ──");

  const payIdDupes = await dupGroups(bookings, "razorpayPaymentId");
  console.log(`bookings.razorpayPaymentId duplicate groups : ${payIdDupes}  ${payIdDupes === 0 ? "✓ safe for UNIQUE index" : "✗ must de-dupe before UNIQUE"}`);

  const emailDupes = await dupGroups(users, "email");
  console.log(`users.email duplicate groups                : ${emailDupes}  ${emailDupes === 0 ? "✓ safe for UNIQUE index" : "✗ must de-dupe before UNIQUE"}`);

  const phoneDupes = await dupGroups(users, "phone");
  console.log(`users.phone duplicate groups                : ${phoneDupes}  ${phoneDupes === 0 ? "✓ safe for UNIQUE index" : "✗ must de-dupe before UNIQUE"}`);

  const importedCount = await bookings.countDocuments({ source: "imported" });
  console.log(`bookings with source="imported"             : ${importedCount}`);

  console.log("── No data modified. ──");
  await mongoose.disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error("dry-run error:", e?.message || e);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
