import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import { paymentGate } from "../middlewares/paymentGate.js";
import { order, validate, createSecureOrder, confirmBooking, createBalanceOrder, confirmBalancePayment, downloadInvoice, reconcilePayment } from "../controllers/Order.js";
import { previewImportPayment, confirmImportPayment } from "../controllers/importPayment.js";
import { createAssistedLink, cancelAssistedLink, getAssistedLinkStatus } from "../controllers/assistedBooking.js";
import { isAdmin } from "../middlewares/isAdmin.js";
import passport from "passport";

export const OrderRoute = Router();
const auth = passport.authenticate("jwt", { session: false });

// ── Secure flow (C1/C2): server decides price + verifies payment. Login required. ──
// `paymentGate` blocks NEW payment initiation while Payment Maintenance is ON
// (except the authorized test account in an isolated test env). The confirm
// endpoints are intentionally NOT gated: they only verify Razorpay's signature
// for a booking that already exists, so an in-flight payment (money already
// captured at Razorpay) can still reconcile — never a path to start a new one.
OrderRoute.post("/createSecureOrder", auth, paymentGate, catchAsync(createSecureOrder));
OrderRoute.post("/confirmBooking", auth, catchAsync(confirmBooking));
// Balance top-up on an existing firstPayment booking.
OrderRoute.post("/createBalanceOrder", auth, paymentGate, catchAsync(createBalanceOrder));
OrderRoute.post("/confirmBalancePayment", auth, catchAsync(confirmBalancePayment));
// Reconcile a payment against Razorpay's authoritative state (owner-only).
// Fail-safe for dropped/slow callbacks; never gated (it RESOLVES an existing
// order, it does not start a new payment).
OrderRoute.get("/payment/reconcile/:orderId", auth, catchAsync(reconcilePayment));

// Invoice PDF (owner or Admin) — always the latest saved booking state.
OrderRoute.get("/invoice/:bookingId", auth, catchAsync(downloadInvoice));

// ── Import Existing Payment (Admin-only) — directive §5 ──
// Attach an already-captured Razorpay payment to a booking without a new charge.
// preview = read-only dry-run (masked evidence + expected-vs-received);
// confirm = create "imported" booking + finalize once. NOT payment-gated: they
// resolve an EXISTING payment and never initiate one.
OrderRoute.post("/admin/import-payment/preview", isAdmin, catchAsync(previewImportPayment));
OrderRoute.post("/admin/import-payment/confirm", isAdmin, catchAsync(confirmImportPayment));

// ── Assisted bookings via Razorpay Payment Links (Admin-only) — directive §3/§4 ──
// Create/cancel a payment link for a server-priced booking intent; poll its
// authoritative status. Confirmation itself happens via the signed webhook
// (routes/paymentWebhook.js) or the status poll's fail-safe — never here.
OrderRoute.post("/admin/assisted-booking/link", isAdmin, catchAsync(createAssistedLink));
OrderRoute.post("/admin/assisted-booking/cancel", isAdmin, catchAsync(cancelAssistedLink));
OrderRoute.get("/admin/assisted-booking/status/:bookingId", isAdmin, catchAsync(getAssistedLinkStatus));

// ── Legacy endpoints (kept temporarily for the currently-deployed client). ──
// TODO: remove once the new client is live everywhere.
// `order` creates a Razorpay order from a client-supplied amount and is
// UNAUTHENTICATED — gated so it cannot start a payment during maintenance.
OrderRoute.post("/order", paymentGate, catchAsync(order));
OrderRoute.post("/validate", catchAsync(validate));

export default OrderRoute;
