import { Router } from "express";
import {
  createHostPayout,
  getAllPayoutsController,
  getPayoutById,
  getPayoutByPayoutId,
  updatePayoutStatus,
  cancelHostPayout,
  getPayoutStats,
  getAccountBalance,
  getBankingBalance,
  getPayoutsByHost,
  updatePayoutStatusWebhook,
} from "../controllers/payouts.js";
import { catchAsync } from "../middlewares/index.js";
import { isAdmin } from "../middlewares/isAdmin.js";

const payoutRoutes = Router();

// IMPORTANT: Route order matters! Most specific routes must come before parameterized routes
// SECURITY: all payout endpoints move real money / expose balances → admin-only.
// The Razorpay webhook stays public but is HMAC signature-verified in the controller.

// Webhook endpoint (public, signature-verified) — must be before parameterized routes
payoutRoutes.post("/webhook", updatePayoutStatusWebhook);

// Statistics and balance (most specific routes first)
payoutRoutes.get("/stats", isAdmin, catchAsync(getPayoutStats));
payoutRoutes.get("/balance", isAdmin, catchAsync(getAccountBalance));
payoutRoutes.get("/banking-balance", isAdmin, catchAsync(getBankingBalance));

// Host-specific routes (specific routes before parameterized ones)
payoutRoutes.get("/host/:hostId", isAdmin, catchAsync(getPayoutsByHost));

// Payout ID routes (specific routes before parameterized ones)
payoutRoutes.get("/payout/:payoutId", isAdmin, catchAsync(getPayoutByPayoutId));

// Status and action routes (specific routes before parameterized ones)
payoutRoutes.patch("/:id/status", isAdmin, catchAsync(updatePayoutStatus));
payoutRoutes.patch("/:id/cancel", isAdmin, catchAsync(cancelHostPayout));

// Basic CRUD operations (parameterized routes last)
payoutRoutes.post("/", isAdmin, catchAsync(createHostPayout));
payoutRoutes.get("/", isAdmin, catchAsync(getAllPayoutsController));
payoutRoutes.get("/:id", isAdmin, catchAsync(getPayoutById));

export default payoutRoutes;
