import "dotenv/config";
import { Counters } from "../models/counters.js";

// ─────────────────────────────────────────────────────────────
// FY-scoped sequential invoice numbers.
//
//   Live:  NT/26-27/0001     (Financial Year April–March, Asia/Kolkata)
//   Test:  NTT/26-27/0001    (Razorpay TEST keys → separate series + counter)
//
//  - Atomic $inc on a per-(env, FY) counter — no duplicates, never reused,
//    independent of booking ids. The counter _id is the Mongo primary key,
//    so issuance is retry-safe and unique under concurrency.
//  - The FY is derived in Asia/Kolkata regardless of server timezone, so the
//    series rolls over exactly at 1 April IST.
//  - Max length 16 chars: the live series stays ≤ 16 up to a 7-digit sequence
//    (NT/26-27/1000000), well beyond any realistic volume, and never truncates.
//  - Call ONLY after a verified successful payment.
//  - Historical numbers in any prior format are preserved untouched: this only
//    governs NEWLY assigned numbers (the DB value, once set, is never rewritten).
// ─────────────────────────────────────────────────────────────

const isDevEnv = () => (process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_test");

// Financial-year label in Asia/Kolkata, e.g. "26-27" for 2026-04 … 2027-03.
// Pure + timezone-safe: reads the IST calendar year/month via Intl, never the
// server's local time.
export const fyLabel = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year").value);
  const m = Number(parts.find((p) => p.type === "month").value); // 1–12
  const startYear = m >= 4 ? y : y - 1; // FY starts in April
  const a = String(startYear % 100).padStart(2, "0");
  const b = String((startYear + 1) % 100).padStart(2, "0");
  return `${a}-${b}`;
};

// Format a sequence into the human-facing invoice number. Pure — testable
// without a DB. Sequence pads to 4 digits and grows past that without collision.
export const formatInvoiceNumber = ({ seq, fy, dev }) => {
  const prefix = dev ? "NTT" : "NT"; // NTT = Nomadic Townies TEST series
  return `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
};

// Invoice numbers contain "/", which is illegal in filenames. Use this anywhere
// the number becomes a filename / Content-Disposition value. Display and storage
// keep the real "/" form.
export const invoiceFileName = (number) =>
  `${String(number || "invoice").replace(/[\\/]/g, "-")}.pdf`;

export const nextInvoiceNumber = async (date = new Date()) => {
  const dev = isDevEnv();
  const fy = fyLabel(date);
  const key = `invoice-${dev ? "DEV" : "LIVE"}-${fy}`; // FY-scoped, env-isolated
  const doc = await Counters.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return formatInvoiceNumber({ seq: doc.seq, fy, dev });
};
