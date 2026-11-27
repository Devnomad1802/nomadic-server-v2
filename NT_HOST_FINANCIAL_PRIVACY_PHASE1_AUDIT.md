# NT — Host Financial Privacy, Revenue & Analytics — PHASE 1 AUDIT (read-only)

**Status:** read-only audit. **No code, data, config, branch or deploy changed.**
Date: 2026-11-27. Builds on `P0_FALSE_CONFIRMATION_AUDIT.md` (26 Nov) and
`NT_HOST_BOOKING_LIVE_SYNC_AUDIT_FINDINGS.md` (27 Nov).

## Headline (plain English)
The host dashboard shows the **customer's retail price (₹35,699) as the host's
revenue**. That is wrong: the host's revenue is their agreed **B2B entitlement**,
which is smaller and is stored per booking option. The host screens also leak
the **Razorpay payment/order id** as the booking reference and the retail total,
and the dashboard's "cancelled" chart counts **abandoned unpaid attempts** as
cancellations. None of this is a money-movement bug — it is a revenue-definition,
field-privacy and counting problem in the host read APIs + host UI.

The **list-level** attempt filtering from the 27 Nov live-sync pass is already on
server `main` (`getMyBookings` filters `isRealBooking && !test`). This audit is
the **financial/privacy layer on top**, not yet addressed.

## Access limitations
No production DB or Razorpay access from here. Actual B2B values and legacy
snapshot coverage must be confirmed with a read-only query (queries provided in
§Migration). The Banaras B2B entitlement is **unknown** — not assumed.

---

## Canonical field mapping (where the money lives)
| Concept | Source of truth | Symbol |
|---|---|---|
| Customer retail charged | booking `total` / `fullTripAmount` (rupees) | `models/bookings.js` |
| Retail line items | `cardData.cardSectionData[]` (snapshot) | written in `Order.js:185` |
| **Host B2B per option** | `cardSectionData[i].hostB2BPrice` + `quantity` | `utils/tripPricing.js:59`, snapshot via `Order.js:80` `lineItems.push({...item})` |
| Host markup / NT margin | `markupRate` on each option; `selling = B2B×(1+markup/100)` | `utils/tripPricing.js:11` |
| Booking reference shown to host | `bookingId` = **Razorpay order id** (website) / **payment id** (imported) | `Order.js:219`, `importPayment.js` |

**Host B2B entitlement (proposed canonical formula):**
`hostB2B(booking) = Σ cardSectionData[i].hostB2BPrice × quantity[i]` over the
immutable snapshot. If any selected option lacks `hostB2BPrice` (legacy) →
**entitlement unknown → flag for Admin reconciliation; never show retail, never
show 0**.

---

## Findings
| ID | Sev | Observed | Root cause (file:line) | Impact | Proposed fix |
|---|---|---|---|---|---|
| **F1** | **Critical** | Host revenue = ₹35.7K (the retail price) | `getMyOverview` grossRevenue = `earningRevenue(bookings)` = Σ `total` (`hostPortal.js:785`, `bookingRevenue.js:earningRevenue`); same in `getMyAnalytics` (`:736`) and `byMonth` (`:820`) | Host sees customer retail as their own revenue — overstates entitlement, exposes NT's retail/margin | New `hostEarning(booking)` = Σ snapshot `hostB2BPrice×qty`; use it for overview revenue, analytics revenue, byMonth. Legacy (no B2B) → excluded from the figure + counted in a "needs Admin reconciliation" flag, not shown as 0 |
| **F2** | High (privacy) | Razorpay id shown as booking reference | `getMyBookings` returns `bookingId` = `order.id`/`pay_…` (`hostPortal.js:135`) | Gateway identifier exposed to host; not a stable NT ref | Return a stable NT reference (the Mongo `_id`, or a derived `NT-…`); keep Razorpay id Admin-only |
| **F3** | High (privacy) | Retail `total` returned in host booking rows | `hostPortal.js:138` | Host sees customer retail transaction total | Replace `total` in the host DTO with `hostEarning` + `paymentState`; drop retail `total`/`fullTripAmount`. Explicit allowlist DTO, not UI hiding |
| **F4** | High | Dashboard "90% cancelled" vs 0 in Bookings | `getMyOverview.byStatus.other` counts every non-full/partial row **including `created` attempts** (`hostPortal.js:828`), computed over the **unfiltered** `bookings` | Unpaid attempts mislabelled as cancellations; chart contradicts the (filtered) list | Compute `byStatus` over `isRealBooking` only; `cancelled = count(isDeadBooking)`; drop `created` from the denominator entirely |
| **F5** | Medium | Analytics: 0 views, 0% conversion despite 1 booking | `views = trip.viewCount` (`:737`); conversion `= 0` when views 0 (`:744`) | Misleading 0% (should be N/A); view tracking appears unfired | Show **N/A** when `views===0`; audit the `viewCount` increment path (is a view ever recorded for these trips?) |
| **F6** | Medium | Payout "pending ₹0" | `pendingPayout` derived only from existing `Payout` docs (`:789`); no entitlement-based "upcoming due" | Host can't see upcoming entitlement vs settled | Distinguish **entitlement** (Σ hostEarning of eligible bookings) vs **paid** (Payout processed) vs **due** per the 50/50 policy — **policy decision required, do not activate payouts** |
| **F7** | Low | `bookings.total` overview count already aligned, but analytics still sums retail | `:805` uses `isEarningBooking` ✓; analytics `:736` does not scope cancellations out of revenue sum but does filter `isEarningBooking` ✓ | Consistency: once F1 lands, all three revenue figures must use `hostEarning` | Single shared helper, used by overview + analytics + exports |

### Already correct — do NOT change
- Ownership: every endpoint uses `requireHost(req)` (auth session) + queries by `host._id`; no client host id trusted; no cross-host leak found.
- Attempt/test exclusion in `getMyBookings` list (`:121`) and overview counts (`:805`).
- Platform commission math is paise-integer (`bookingRevenue.js:platformCommissionPaise`).

---

## Reconciliation of the example (code-level; prod values UNVERIFIED)
- ₹35,699 shown as host revenue = the **retail `total`** on the booking, surfaced by F1. **Host B2B entitlement is a different, smaller number** = Σ `hostB2BPrice×qty` from that booking's snapshot — **value unknown here**; do not assume ₹30,000 or reverse it from retail (directive §1).
- Razorpay id as reference = F2.
- "90% cancelled vs 0" = F4 (attempts counted as cancelled in the chart only).
- "0 views / 0% conversion" = F5 (viewCount not incremented; conversion should be N/A).
- "pending payout ₹0" = F6 (no Payout docs; entitlement not yet modelled).

---

## Host vs Admin field visibility (proposed)
| Field | Admin | Host | Customer |
|---|---|---|---|
| Customer retail total / `total` / `fullTripAmount` | ✓ | ✗ | own only |
| Host B2B entitlement (`hostEarning`) | ✓ | ✓ | ✗ |
| NT margin / markupRate / commissionRate | ✓ | ✗ | ✗ |
| Razorpay order/payment id | ✓ | ✗ | own only |
| Booking reference (stable NT id) | ✓ | ✓ | ✓ |
| Customer contact (email/phone) | ✓ | platform-safe only (name/city) | self |
| GST / gateway fees | ✓ | ✗ | on invoice |

Enforce via an explicit host **DTO allowlist**, not UI hiding.

---

## Migration / backfill (dry-run only — no writes)
Read-only queries to run on prod (I will provide exact scripts):
1. Count bookings whose snapshot `cardSectionData` **has** `hostB2BPrice` on every selected option (B2B-derivable) vs **legacy** (missing) — per host.
2. For legacy rows: list `_id`s for Admin reconciliation (never guess B2B).
No row is mutated; legacy entitlement stays flagged, shown as "Pending Admin
reconciliation", never 0 and never retail.

## Implementation plan (Phase 2 — after approval)
1. **server `utils/bookingRevenue.js`**: add `hostEarningOf(booking)` (Σ snapshot `hostB2BPrice×qty`; `null` when legacy) + `hostEarningTotal(bookings)` (sum of known; separate `unreconciledCount`).
2. **server `controllers/hostPortal.js`**: overview/analytics revenue + byMonth → `hostEarningTotal`; `byStatus` over `isRealBooking` with real `cancelled`; conversion N/A when views 0; host booking DTO → `{ reference(NT id), hostEarning|null, paymentState, lifecycle, trip, batch, travellerName/count }`, drop `total`/`bookingId(razorpay)`.
3. **host-v2 `bookings/page.tsx` + dashboard**: render `hostEarning` (or "Pending reconciliation"), stable reference, server figures; remove retail sums and the `else→Full Payment` default (the live-sync pass covers part — coordinate).
4. Tests: synthetic B2B ₹30,000 / retail ₹34,500 → host sees ₹30,000; legacy snapshot → flagged, not 0/retail; cross-host DTO has no retail/margin/razorpay fields; zero views → N/A.

Branches (Phase 2, suggested): `feature/host-financial-privacy-and-analytics` in `nomadic-server-v2` and `nomadic-host-v2`.

## Unresolved policy decisions (owner)
- Payout entitlement vs due (50/50 arrival/completion) — **do not activate**.
- Legacy bookings with no B2B snapshot: reconcile how? (Admin backfill vs permanent flag.)
- Whether retail/`total` may remain in the host API for ONE backward-compatible release or must be removed immediately.

---

**AUDIT COMPLETE — IMPLEMENTATION NOT STARTED. Awaiting explicit owner approval.**
Blockers: production DB/Razorpay read access for the B2B-coverage reconciliation
(§Migration) — queries ready on request.
