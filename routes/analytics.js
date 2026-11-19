import { Router } from "express";
import { getAnalyticsOverview, getPlatformRevenue } from "../controllers/analytics.js";
import { catchAsync } from "../middlewares/index.js";
import { isAdmin } from "../middlewares/isAdmin.js";

export const analyticsRoutes = Router();

// Admin-only — exposes revenue/business data
analyticsRoutes.get("/overview", isAdmin, catchAsync(getAnalyticsOverview));
analyticsRoutes.get("/platform-revenue", isAdmin, catchAsync(getPlatformRevenue));

export default analyticsRoutes;
