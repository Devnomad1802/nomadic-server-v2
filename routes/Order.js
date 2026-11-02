import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import { paymentGate } from "../middlewares/paymentGate.js";
import { order, validate, createSecureOrder, confirmBooking, createBalanceOrder, confirmBalancePayment, downloadInvoice, reconcilePayment } from "../controllers/Order.js";
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

// ── Legacy endpoints (kept temporarily for the currently-deployed client). ──
// TODO: remove once the new client is live everywhere.
// `order` creates a Razorpay order from a client-supplied amount and is
// UNAUTHENTICATED — gated so it cannot start a payment during maintenance.
OrderRoute.post("/order", paymentGate, catchAsync(order));
OrderRoute.post("/validate", catchAsync(validate));

export default OrderRoute;
