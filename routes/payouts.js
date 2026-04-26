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

const payoutRoutes = Router();

// IMPORTANT: Route order matters! Most specific routes must come before parameterized routes

// Statistics and balance (most specific routes first)
payoutRoutes.get("/stats", catchAsync(getPayoutStats));
payoutRoutes.get("/balance", catchAsync(getAccountBalance));
payoutRoutes.get("/banking-balance", catchAsync(getBankingBalance));

// Webhook endpoint (must be before parameterized routes)
payoutRoutes.post("/webhook", updatePayoutStatusWebhook);

// Host-specific routes (specific routes before parameterized ones)
payoutRoutes.get("/host/:hostId", catchAsync(getPayoutsByHost));

// Payout ID routes (specific routes before parameterized ones)
payoutRoutes.get("/payout/:payoutId", catchAsync(getPayoutByPayoutId));

// Status and action routes (specific routes before parameterized ones)
payoutRoutes.patch("/:id/status", catchAsync(updatePayoutStatus));
payoutRoutes.patch("/:id/cancel", catchAsync(cancelHostPayout));

// Basic CRUD operations (parameterized routes last)
payoutRoutes.post("/", catchAsync(createHostPayout));
payoutRoutes.get("/", catchAsync(getAllPayoutsController));
payoutRoutes.get("/:id", catchAsync(getPayoutById));

export default payoutRoutes;
