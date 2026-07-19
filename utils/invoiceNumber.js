import "dotenv/config";
import { Counters } from "../models/counters.js";

// ─────────────────────────────────────────────────────────────
// Sequential invoice numbers: NT-INV-<year>-000001
//  - Test Razorpay keys → DEV-NT-INV-… on a SEPARATE counter, so
//    switching to live keys starts clean production numbering with
//    zero code changes (prefix + counter derive from env).
//  - Atomic $inc — no duplicates, never reused, independent of
//    booking ids. Call ONLY after a verified successful payment.
// ─────────────────────────────────────────────────────────────
const isDevEnv = () => (process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_test");

export const nextInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const dev = isDevEnv();
  const key = `invoice-${dev ? "DEV" : "LIVE"}-${year}`;
  const doc = await Counters.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const prefix = dev ? "DEV-NT-INV" : "NT-INV";
  return `${prefix}-${year}-${String(doc.seq).padStart(6, "0")}`;
};
