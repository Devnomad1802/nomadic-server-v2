// ─────────────────────────────────────────────────────────────
// Which bookings count as real host earnings / revenue.
// A booking counts only when it carries a successful payment AND is
// not cancelled/refunded/failed/rejected. Pending (unpaid) and dead
// bookings never inflate revenue, analytics or payout figures.
// ─────────────────────────────────────────────────────────────

const EARNING_PAYMENT = new Set(["firstpayment", "fullpayment", "paid", "completed", "success"]);
const DEAD = new Set(["cancelled", "canceled", "refunded", "failed", "rejected"]);

export const isEarningBooking = (b) => {
  const ps = String(b?.paymentStatus ?? "").toLowerCase();
  const st = String(b?.status ?? "").toLowerCase();
  if (DEAD.has(ps) || DEAD.has(st)) return false;
  return EARNING_PAYMENT.has(ps);
};

// A booking that was once confirmed but is now cancelled/refunded/failed.
// Belongs in "cancelled history" — NOT in upcoming/completed, NOT in revenue.
export const isDeadBooking = (b) => {
  const ps = String(b?.paymentStatus ?? "").toLowerCase();
  const st = String(b?.status ?? "").toLowerCase();
  return DEAD.has(ps) || DEAD.has(st);
};

// Real booking of any kind (confirmed OR a previously-confirmed cancellation).
// Excludes pure checkout attempts (paymentStatus "created"/empty, never paid),
// which must never surface to a host as a booking.
export const isRealBooking = (b) => isEarningBooking(b) || isDeadBooking(b);

// Canonical payment label for a host-facing row. Never guesses "full".
//   "full"     → fully paid
//   "partial"  → advance/first payment only
//   "refunded" → money returned
//   "pending"  → real-but-not-yet-earning edge (should be rare post-filter)
export const paymentStateOf = (b) => {
  const ps = String(b?.paymentStatus ?? "").toLowerCase();
  const st = String(b?.status ?? "").toLowerCase();
  if (ps.includes("refund") || st.includes("refund")) return "refunded";
  if (ps === "firstpayment" || ps.includes("partial")) return "partial";
  if (EARNING_PAYMENT.has(ps)) return "full";
  return "pending";
};

// Sum of `total` (CUSTOMER RETAIL) across earning bookings only. This is NOT
// host revenue — it is what the customer paid. Host-facing surfaces must use
// hostEarningOf/hostEarningTotal instead; retail stays Admin-only.
export const earningRevenue = (bookings = []) =>
  bookings.filter(isEarningBooking).reduce((s, b) => s + (Number(b.total) || 0), 0);

// ─────────────────────────────────────────────────────────────
// HOST revenue = the agreed B2B entitlement, taken from the IMMUTABLE booking
// snapshot (never the retail price, never reverse-computed from it). Each
// selected option in cardData.cardSectionData carries hostB2BPrice × quantity.
//
//   hostEarningOf(booking) → integer rupees, or `null` when the snapshot does
//     not carry B2B for every selected option (legacy booking). `null` means
//     "entitlement unknown → Admin reconciliation" — callers must NOT treat it
//     as 0 and must NOT fall back to retail.
// ─────────────────────────────────────────────────────────────
export const hostEarningOf = (booking) => {
  let cd;
  try { cd = JSON.parse(booking?.cardData || "{}"); } catch { return null; }
  const items = Array.isArray(cd.cardSectionData) ? cd.cardSectionData : [];
  if (items.length === 0) return null; // no snapshot → unknown, not 0
  let sum = 0;
  for (const it of items) {
    const b2b = Number(it?.hostB2BPrice);
    const qty = Number(it?.quantity) || 0;
    if (!Number.isFinite(b2b) || b2b <= 0) return null; // any option missing B2B → whole booking unknown
    sum += b2b * qty;
  }
  return Math.round(sum);
};

// Host B2B totals across EARNING bookings only. Returns the summed entitlement
// for rows whose B2B is known, plus the count of earning rows whose B2B is not
// in the snapshot (shown to the host as "pending reconciliation", never money).
export const hostEarningTotal = (bookings = []) => {
  let earning = 0;
  let unreconciled = 0;
  for (const b of bookings) {
    if (!isEarningBooking(b)) continue;
    const e = hostEarningOf(b);
    if (e === null) { unreconciled += 1; continue; }
    earning += e;
  }
  return { earning, unreconciled };
};

// ─────────────────────────────────────────────────────────────
// Platform earned commission (Nomadic Townies' own revenue), in PAISE.
//
// Per eligible (earning) booking: commission = paid amount × that trip's
// commissionRate%. We work in integer paise to avoid float money errors:
//   paise = round(paidRupees × 100 × rate / 100) = round(paidRupees × rate).
// A booking with no trip / no rate contributes 0 (never guess a rate).
// Cancelled/refunded/unpaid bookings are already excluded by isEarningBooking,
// so no separate refund subtraction is needed.
//   rateFor(booking) → commission rate as a Number (percent), or 0.
// ─────────────────────────────────────────────────────────────
export const platformCommissionPaise = (bookings = [], rateFor = () => 0) =>
  bookings.filter(isEarningBooking).reduce((paise, b) => {
    const paid = Number(b?.total) || 0;
    const rate = Number(rateFor(b)) || 0;
    if (paid <= 0 || rate <= 0) return paise;
    return paise + Math.round(paid * rate); // paid×rate = paise of commission
  }, 0);
