import { Router } from "express";
import passport from "passport";
import { catchAsync } from "../middlewares/index.js";
import { isAdmin } from "../middlewares/isAdmin.js";
import {
  getAdminPaymentSettings,
  updatePaymentSettings,
  getPublicPaymentStatus,
  getPaymentCapability,
} from "../controllers/paymentSettings.js";

export const PaymentSettingsRoute = Router();
const auth = passport.authenticate("jwt", { session: false });

// Public: the client reads this to decide whether to show the payment CTA or the
// maintenance notice + WhatsApp enquiry. No secrets.
PaymentSettingsRoute.get("/payment-status", catchAsync(getPublicPaymentStatus));

// Authenticated: per-user capability so the authorized test account still gets
// the real pay button during maintenance.
PaymentSettingsRoute.get("/payment-capability", auth, catchAsync(getPaymentCapability));

// Admin only (role === "Admin"): read + update the maintenance settings.
PaymentSettingsRoute.get("/admin/payment-settings", isAdmin, catchAsync(getAdminPaymentSettings));
PaymentSettingsRoute.put("/admin/payment-settings", isAdmin, catchAsync(updatePaymentSettings));

export default PaymentSettingsRoute;
