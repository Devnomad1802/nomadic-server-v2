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

// Sum of `total` across earning bookings only.
export const earningRevenue = (bookings = []) =>
  bookings.filter(isEarningBooking).reduce((s, b) => s + (Number(b.total) || 0), 0);
