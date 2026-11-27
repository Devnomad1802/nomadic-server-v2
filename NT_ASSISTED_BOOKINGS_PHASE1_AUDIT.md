# Nomadic Townies — Assisted Bookings & Razorpay Payment Links — Phase 1 Audit

**Status:** Read-only audit complete. **No code changed. No branches pushed. No records touched.** Awaiting approval before any implementation.
**Date:** 2026-11-27
**Scope of this document:** evidence, current behaviour, gaps, risks, and an implementation plan for the directive in `NT_Assisted_Bookings_Implementation.md`. This is the mandated audit-first deliverable; the STOP gate at the end must be cleared before code is written.

---

## Headline for the owner (plain English)

The platform already has a **secure, server-authoritative booking engine** (price computed on the server, payment verified by signature, one idempotent confirmation point, authoritative Razorpay reconciliation). That is the correct foundation and we will **extend it, not rebuild it**.

What does **not** exist yet and must be built for assisted bookings:
1. **Admin "Add Customer"** — no admin endpoint creates a minimal customer profile today.
2. **Admin "Create Booking"** — no admin-initiated booking path; the only booking entry is the customer's own website checkout.
3. **Razorpay Payment Links** — not used anywhere in the codebase (the SDK supports them; we have never called them).
4. **An inbound payment webhook** — today only *payouts* have a webhook. Customer payments are confirmed by the browser callback or by polling. A payment **link** paid in the customer's own browser (not ours) has **no server path to confirm it** without a webhook or a poll.
5. **Import Existing Payment** — no admin tool to attach an already-captured Razorpay payment to a booking.
6. **A `source` field and durable identity/activation** — bookings don't record their origin; customer email/phone are not unique; OTP is in-memory only.

The biggest **safety invariant** — *an unpaid/abandoned attempt must never look confirmed* — is already understood and enforced on the canonical revenue path (`isEarningBooking`). The recent host-dashboard P0 (`NT_HOST_BOOKING_LIVE_SYNC_AUDIT_FINDINGS.md`) was exactly a case of a surface bypassing that filter. **Every new surface in this feature must route through the same filter and the same single confirmation point.**

---

## Repos / revisions inspected (read-only)

| Repo | Branch | HEAD | Deploy trigger |
|---|---|---|---|
| nomadic-server-v2 | main | `53ca5d7` (has host-sync #20) | **manual droplet pull** |
| nomadic-admin-v2 | main | `063e9d35` | **Vercel auto-deploy on `main` push** |
| nomadic-host-v2 | main | `d321b25` | Vercel auto-deploy on `main` push |
| nomadic-client-v2-nextjs | main | (not required for this feature) | Vercel auto-deploy on `main` push |

**Deploy-safety note:** the admin app proxies `/api/*` straight to `http://168.144.119.114:5000` (`nomadic-admin-v2/vercel.json`). So admin UI can ship independently, but it is **useless until the matching server endpoints are live on the droplet**. Server is the gating deploy and it is manual. Plan server-first, admin-second.

---

## What already exists and is correct (REUSE — do not duplicate)

### Booking engine — `controllers/Order.js`
- **`computeTripAmount(trip, quantities, couponCode)`** (`Order.js:63`) — server-authoritative price: base from `trip.addsection` category `TitlePrice`, 10% coupon, **5% GST**, rounded total. *Currently a module-private function — must be exported/extracted to be reused by an assisted-booking path instead of re-implemented.*
- **`createSecureOrder`** (`Order.js:94`) — creates a Razorpay **order** + a `paymentStatus:"created"` booking keyed by order id; enforces seat capacity and approval gate server-side.
- **`finalizeBookingPaid(booking, opts)`** (`Order.js:257`) — **THE single idempotent confirmation point.** Flips `created → firstPayment|fullPayment`, assigns the invoice number exactly once, backfills contact, consumes the approval, sends the confirmation email + invoice PDF. Guards: `if (booking.paymentStatus !== "created") return` (line 261). **All channels — website, assisted link, import — must funnel through this.**
- **`confirmBooking`** (`Order.js:387`) — verifies the Razorpay handshake signature with the booking's own mode secret, then calls finalize.
- **`mapPaymentsToState(payments)`** (`Order.js:752`) + **`reconcilePayment`** (`Order.js:767`) — authoritative: fetches `orders.fetchPayments`, maps to CAPTURED / PENDING / FAILED, finalizes only on CAPTURED. **This is the pattern Import-Existing-Payment should reuse** (fetch authoritative state, never trust a client flag).
- **`createBalanceOrder` / `confirmBalancePayment`** (`Order.js:449` / `:506`) — remaining-balance top-up for `firstPayment` bookings. Partial-payment semantics already exist.

### Revenue truth — `utils/bookingRevenue.js`
`EARNING_PAYMENT = {firstpayment, fullpayment, paid, completed, success}`, `DEAD = {cancelled, refunded, failed, rejected}`, `isEarningBooking`, `earningRevenue`, `platformCommissionPaise`, plus the host-sync additions `isDeadBooking` / `isRealBooking` / `paymentStateOf`. **Canonical. Every count/sum in every dashboard must go through these.**

### Environment isolation — `services/paymentAvailability.js`
`keysForMode(mode)` / `secretForMode(mode)` select **live vs test** Razorpay keys; bookings carry `mode: "live"|"test"` and `AUTHORIZED_TEST_EMAIL` gates test-mode side effects. Sandbox isolation (PRs #15–#17) already mode-gates side effects so test bookings stay out of real revenue. **Assisted bookings and payment links must honour the same `mode` plumbing and the same test-email guard — no new live/test path.**

### Approval gate — `services/approvalGate.js`
`requireValidApproval({userId, tripId, batchIndex, partySize})` and `consumeApprovalForBooking(...)` — invite-only trips (`trip.bookingMode === "approval"`). Already enforced in `createSecureOrder` and consumed in `finalizeBookingPaid`. **Assisted bookings for approval-mode trips must call the same gate before creating a link and must not bypass it.**

### Seats, invoices, payouts
- `services/seatAvailability.js` `getBatchOccupancy` — capacity is fixed, occupancy derived from **paid** bookings (no mutable decrement → no double-count). Revalidate at confirmation (already done in finalize).
- `utils/invoiceNumber.js` `nextInvoiceNumber` / `invoiceFileName`, `services/invoicePdf.js` — one invoice per paid booking, assigned in finalize.
- `services/razorpayxService.js` + `controllers/payouts.js` — RazorpayX payouts to hosts; **the only existing webhook** (`POST /payouts/webhook`, HMAC-verified with `RAZORPAY_WEBHOOK_SECRET`, `controllers/payouts.js:130`). Good reference for signature verification style.

---

## Gaps & risks (what must be built, with the invariant each one protects)

### G1 — No admin "Add Customer"
`controllers/users.js` has `register` (public), `getAllUsers` (admin), `editUser` (**not** admin-guarded — pre-existing concern, note for RBAC pass). No admin endpoint creates a minimal pending-activation customer.
- **Risk:** `models/user.js` — `email` and `phone` are plain `String`, **no unique index**. Creating customers by email without a DB-level uniqueness constraint invites duplicates and conflicting ownership. Directive §3 requires uniqueness "at database level where applicable" and **flagging** conflicts, not auto-merge.
- **Decision needed:** adding a unique index on a dirty production `users` collection can fail if duplicates already exist → a migration dry-run + de-dupe plan is required before any unique constraint. **Do not add the index blind.**

### G2 — No admin "Create Booking" / durable pending intent
No admin-initiated booking path exists. The directive wants a **durable pending booking intent** (customer, trip/batch/category, pricing snapshot, amount, currency, environment, source, approval ref) that a payment link attaches to.
- The existing `created` booking row *is* a pending intent, but it has **no `source`** and **no payment-link fields**. Needs additive schema.
- **Invariant:** the intent must store a **server-computed** pricing snapshot (via the extracted `computeTripAmount`), never a browser-supplied amount.

### G3 — Razorpay Payment Links absent
Zero `paymentLink` / `plink_` usage. SDK `razorpay@2.9.6` **does** expose `instance.paymentLink.create/fetch/cancel` (`node_modules/razorpay/dist/resources/paymentLink.js`) — **no new dependency**.
- **Must:** create links **server-side** with `reference_id` = our internal booking-intent id (for dedupe/association), persist the returned `id` (`plink_…`) + `short_url`, set expiry, and **reconcile/cancel a prior active link before regenerating** (directive §4) so two live links can't double-charge.
- **Risk:** a payment link is paid in the **customer's** browser, not ours — there is **no handshake-signature callback** like the website flow. Confirmation must come from (a) an inbound **webhook** (G4) and/or (b) a **poll** of link status. Relying on a client redirect is explicitly forbidden (§4).

### G4 — No inbound payment webhook
Only payouts have a webhook. For assisted links we need a verified server path for `payment_link.paid` / `payment_link.partially_paid` (and/or `payment.captured`).
- **Must:** verify signature against the **raw request body** with an **environment-specific** webhook secret; the existing payout webhook reads one shared `RAZORPAY_WEBHOOK_SECRET` — assisted payments likely need their own secret and **must not** reuse the payout secret blindly. Verify `event`, captured status, account/mode, currency, amount, and the `reference_id → booking-intent` association before confirming. Dedupe on provider payment id (needs a **unique index**, see G6). Confirm **only** via `finalizeBookingPaid`.
- **Decision needed:** webhook URL + secret must be configured in the Razorpay dashboard by the owner. Env var **names** only will be documented; the owner sets values. This is a production webhook change → explicitly behind the approval gate (§9).

### G5 — No Import Existing Payment
No tool to attach an already-captured payment/link to a booking.
- **Reuse:** `mapPaymentsToState` + an admin-only authoritative fetch (`payments.fetch(pay_id)` or `paymentLink.fetch(plink_id)` then enumerate its payments). Show masked evidence, expected-vs-received, reject test/uncaptured/refunded/already-allocated, **never create a new charge**, preserve original payment timestamp, confirm via the shared `finalizeBookingPaid`.
- **Risk:** duplicate allocation across website orders, links, and imports.

### G6 — No dedupe constraints
`models/bookings.js`: `razorpayPaymentId` has **no unique index** (only `razorpayOrderId` and `balanceOrderId` are sparse-indexed). Webhook replay and import both need **DB-level** dedupe on payment id + link id.
- **Decision needed:** same migration caution as G1 — verify no existing duplicate `razorpayPaymentId` values before adding a unique sparse index.

### G7 — Identity / activation is not durable
`services/emailOtpService.js` — OTP is an **in-memory `Map`** (`otpStore = new Map()`, line 5). It is **lost on every `pm2 restart`** and **not shared across instances**. For admin-created pending-activation customers this is fragile.
- **Decision needed:** activation for assisted customers should use a **single-use, expiring, stored** token (DB/Redis), per directive §7 ("activation tokens are expiring, single-use and securely stored"). Confirm the intended activation UX (OTP vs. magic link) before building.

### G8 — Revenue KPI definition (financial, needs owner sign-off)
Directive §6 defines Revenue KPI as **commercial margin** = selling-price-ex-GST − agreed host cost − discount allocation, recognise collected portion, reverse refunds.
- **Cost source EXISTS:** `utils/tripPricing.js` shows the host B2B cost is stored **per category option** as `item.hostB2BPrice`, with `markupRate` and `selling = B2B × (1 + markup/100)`. So the margin inputs are available at line-item level (this corrects the earlier assumption that B2B cost was absent).
- **What's still missing / undecided:** bookings do **not** snapshot the B2B cost at purchase time (only `orderAmount`/`fullTripAmount`), and the **partial-payment / refund allocation policy** (how collected margin is recognised across an advance, and how refunds reverse it) is **undefined in code**.
- **Blocker (narrowed):** the allocation/recognition policy must be confirmed by the owner before any KPI math is wired. Per §6 we **report and request approval before changing financial logic** — not invent it. (Import-first does not need the KPI; it stores amounts like a website booking.)

---

## Proposed implementation plan (for approval — NOT started)

Sequenced so each step is independently safe and testable. **Nothing merges to main or deploys without separate approval. All testing in Razorpay test mode against a non-production DB.**

**Phase 2a — Server foundations (no external effects)**
1. Extract `computeTripAmount` into a shared, exported pricing helper (e.g. `utils/tripPricing.js`) so website + assisted paths share one price truth. Pure refactor, covered by a self-check test.
2. Additive `Bookings` schema fields: `source` (`website|admin_assisted|imported`), `paymentLinkId`, `paymentLinkShortUrl`, `pricingSnapshot`, `importedAt`, `assistedBy` (admin actor). **Additive only**, defaults preserve existing behaviour.
3. Migration **dry-run** scripts (read-only first) to check duplicate `email`/`phone` and duplicate `razorpayPaymentId` before any unique index. **Report counts; do not alter data.**

**Phase 2b — Admin customer + booking intent (server + admin UI)**
4. Admin-only `createCustomer` (RBAC-guarded, normalize + search + conflict flag, pending-activation, no password set).
5. Admin-only `createAssistedBookingIntent` → server-priced `created` booking with `source:"admin_assisted"`, approval gate honoured.
6. Admin UI: Add Customer, Create Booking (reusing real availability + authoritative prices), both behind the admin proxy.

**Phase 2c — Payment Links + webhook**
7. Server `paymentLink.create` with `reference_id`, persistence, prior-link cancel-before-regenerate; Admin "Payment Links" view (status/expiry/copy/share/cancel/regenerate); user-initiated WhatsApp/email share (no paid WhatsApp API, no false "delivered").
8. New **payment webhook** (raw-body signature verify, env-specific secret, dedupe, confirm only via `finalizeBookingPaid`) **+** a poll fallback.

**Phase 2d — Import Existing Payment**
9. Admin-only import (reuse `mapPaymentsToState`, masked evidence, dry-run preview, reject invalid, dedupe, no new charge, shared confirm + invoice).

**Phase 2e — Sync, KPI, tests**
10. Verify Admin/Host/Customer surfaces all read through `isEarningBooking` (host already fixed). Wire the Revenue KPI **only after** the §6 financial decisions (G8) are signed off.
11. Focused automated tests for payment invariants (link opened/abandoned/expired ⇒ no confirm; captured ⇒ exactly one confirm; webhook replay/out-of-order ⇒ no dup; wrong amount/currency/mode ⇒ rejected; import dup ⇒ rejected).

---

## Blockers / decisions required before implementation (approval gate)

1. **G8 — Revenue KPI & host B2B cost / allocation policy.** Undefined in code. Need the host-cost source and the partial/refund allocation rule. *Financial logic — must not be invented.*
2. **G1/G6 — unique indexes on `users` and `bookings`.** Require a migration dry-run + de-dupe plan on production data first. *Do not add blind.*
3. **G4 — production webhook.** Owner must configure the Razorpay webhook URL + a dedicated secret in the dashboard. *Production provider change — explicitly gated.*
4. **G7 — activation mechanism** for assisted customers (durable OTP vs. stored magic link). Confirm intended UX.
5. **Scope/sequencing confirmation** — is the **immediate business priority Import Existing Payment** (directive §5) to be built first, ahead of the full assisted-booking flow? The directive flags §5 as the immediate priority; confirm whether to front-load it.

## Assumptions (state if wrong)
- Razorpay account has Payment Links enabled (SDK supports it; account capability to be confirmed in the dashboard by the owner).
- Test mode + non-production DB are available for all acceptance testing; no real charge/refund/notification during build.
- "Manual selling price" (admin markup, admin PR #9) is admin-owned and **must not** be overwritten by any recompute.

---

**STOP — audit only. No branches, no code, no schema change, no migration, no deploy performed. Awaiting your decisions on the 5 blockers above (especially the §5 "Import first?" sequencing and the §6 financial policy) before Phase 2a begins.**
