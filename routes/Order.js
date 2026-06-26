import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import { order, validate, createSecureOrder, confirmBooking } from "../controllers/Order.js";
import passport from "passport";

export const OrderRoute = Router();
const auth = passport.authenticate("jwt", { session: false });

// ── Secure flow (C1/C2): server decides price + verifies payment. Login required. ──
OrderRoute.post("/createSecureOrder", auth, catchAsync(createSecureOrder));
OrderRoute.post("/confirmBooking", auth, catchAsync(confirmBooking));

// ── Legacy endpoints (kept temporarily for the currently-deployed client). ──
// TODO: remove once the new client is live everywhere.
OrderRoute.post("/order", catchAsync(order));
OrderRoute.post("/validate", catchAsync(validate));

export default OrderRoute;
