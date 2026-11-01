# Payment Maintenance Mode — server

Server-side security boundary + settings API for Payment Maintenance Mode.

## Behaviour
- Single source of truth: `PaymentSettings` singleton doc (`key: "payment"`), read
  through `services/paymentAvailability.js` (5s cache, **fails closed** on DB error).
- Default is **maintenance ON** — no online payments until an admin deliberately
  turns it OFF. Never auto-enables payments on missing config.
- While ON, `middlewares/paymentGate.js` denies **new payment initiation** on every
  order-creation endpoint with `503 { error:{ type:"PAYMENTS_UNAVAILABLE" }, code }`.
- Confirm endpoints are **not** gated: they only verify a Razorpay signature for a
  booking the server already created, so an in-flight payment still reconciles — never
  a way to start a new one.
- The RazorpayX **payout** webhook (`POST /api/razorpay/webhook`) is untouched.

## Endpoints
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/payment-status` | public | maintenance state + WhatsApp + notice copy (no secrets) |
| GET | `/api/admin/payment-settings` | admin | settings + diagnostics + recent audit |
| PUT | `/api/admin/payment-settings` | admin | toggle / WhatsApp (E.164) / copy; audited |

Gated (order creation): `POST /api/createSecureOrder`, `/api/createBalanceOrder`,
`/api/order` (legacy, unauth). Not gated (verify only): `/api/confirmBooking`,
`/api/confirmBalancePayment`, `/api/validate`.

## New environment variables (all optional; absence = safe defaults)
| Var | Purpose |
|---|---|
| `AUTHORIZED_TEST_EMAIL` | Authorized sandbox identity. Defaults to `hm101094@gmail.com`. |
| `PAYMENTS_TEST_MODE_ENABLED` | `"true"` only in an **isolated/staging** env to enable the test sandbox path. Leave UNSET in production. |
| `RAZORPAY_TEST_KEY_ID` / `RAZORPAY_TEST_KEY_SECRET` | Razorpay **test** credentials. Used only when the sandbox is enabled; never falls back to live. |

Existing live vars (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`)
are unchanged.

### Test sandbox (staging only)
In production, `PAYMENTS_TEST_MODE_ENABLED` is unset ⇒ `isTestEnvReady()` is false ⇒
even the authorized, verified account is blocked while maintenance is ON (no live
charges, no test checkout in prod). The sandbox only activates in an environment that
sets the test vars above. Test orders/bookings are tagged `mode: "test"`.

## Tests
`node scripts/paymentGate.test.mjs` — authorization-core regression (identity,
prod-isolation, per-mode key selection). DB-dependent paths are exercised via the
review checklist (no server test harness is configured).
