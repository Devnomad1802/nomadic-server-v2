import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import { isAdmin } from "../middlewares/isAdmin.js";
import {
  getAdminPaymentSettings,
  updatePaymentSettings,
  getPublicPaymentStatus,
} from "../controllers/paymentSettings.js";

export const PaymentSettingsRoute = Router();

// Public: the client reads this to decide whether to show the payment CTA or the
// maintenance notice + WhatsApp enquiry. No secrets.
PaymentSettingsRoute.get("/payment-status", catchAsync(getPublicPaymentStatus));

// Admin only (role === "Admin"): read + update the maintenance settings.
PaymentSettingsRoute.get("/admin/payment-settings", isAdmin, catchAsync(getAdminPaymentSettings));
PaymentSettingsRoute.put("/admin/payment-settings", isAdmin, catchAsync(updatePaymentSettings));

export default PaymentSettingsRoute;
