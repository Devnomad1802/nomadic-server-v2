// ─────────────────────────────────────────────────────────────
// Single source of truth for the partial-payment system.
// Balance is always due 15 days before the trip departs.
// ─────────────────────────────────────────────────────────────
export const BALANCE_DUE_DAYS_BEFORE = 15;

// Balance due date = departure − 15 days. Returns a Date or null.
export const balanceDueDate = (departure) => {
  if (!departure) return null;
  const d = new Date(departure);
  if (isNaN(d)) return null;
  d.setDate(d.getDate() - BALANCE_DUE_DAYS_BEFORE);
  return d;
};

export const fmtBalanceDueDate = (departure) => {
  const d = balanceDueDate(departure);
  return d
    ? d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "";
};

// Is partial payment allowed for THIS trip on THIS batch, right now?
// Rules:
//  - trip.partialPaymentEnabled === false  → never (explicit admin off)
//  - otherwise derive from a positive firstBookingPrice (back-compat)
//  - AND the batch must depart more than 15 days out (else full only)
export const isPartialAllowed = ({ partialPaymentEnabled, firstBookingPrice, departure }) => {
  if (partialPaymentEnabled === false) return false;
  const price = Math.round(Number(firstBookingPrice) || 0);
  if (price <= 0) return false;
  const due = balanceDueDate(departure);
  if (!due) return false;
  return due.getTime() > Date.now();
};
