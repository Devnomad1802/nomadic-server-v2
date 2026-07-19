import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import { order, validate, createSecureOrder, confirmBooking, createBalanceOrder, confirmBalancePayment, downloadInvoice } from "../controllers/Order.js";
import passport from "passport";

export const OrderRoute = Router();
const auth = passport.authenticate("jwt", { session: false });

// ── Secure flow (C1/C2): server decides price + verifies payment. Login required. ──
OrderRoute.post("/createSecureOrder", auth, catchAsync(createSecureOrder));
OrderRoute.post("/confirmBooking", auth, catchAsync(confirmBooking));
// Balance top-up on an existing firstPayment booking.
OrderRoute.post("/createBalanceOrder", auth, catchAsync(createBalanceOrder));
OrderRoute.post("/confirmBalancePayment", auth, catchAsync(confirmBalancePayment));
// Invoice PDF (owner or Admin) — always the latest saved booking state.
OrderRoute.get("/invoice/:bookingId", auth, catchAsync(downloadInvoice));

// ── Legacy endpoints (kept temporarily for the currently-deployed client). ──
// TODO: remove once the new client is live everywhere.
OrderRoute.post("/order", catchAsync(order));
OrderRoute.post("/validate", catchAsync(validate));

export default OrderRoute;
