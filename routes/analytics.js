import { Router } from "express";
import { getAnalyticsOverview } from "../controllers/analytics.js";
import { catchAsync } from "../middlewares/index.js";
import { isAdmin } from "../middlewares/isAdmin.js";

export const analyticsRoutes = Router();

// Admin-only — exposes revenue/business data
analyticsRoutes.get("/overview", isAdmin, catchAsync(getAnalyticsOverview));

export default analyticsRoutes;
