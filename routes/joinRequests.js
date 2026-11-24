import { Router } from "express";
import rateLimit from "express-rate-limit";
import passport from "passport";
import { catchAsync } from "../middlewares/index.js";
import { isAdmin } from "../middlewares/isAdmin.js";
import {
  applyToTrip,
  myApplications,
  withdrawApplication,
  adminListJoinRequests,
  adminRevokeJoinRequest,
} from "../controllers/joinRequests.js";

const auth = passport.authenticate("jwt", { session: false });

// Abuse guard on application submission (per IP). Mirrors the enquiry limiter.
const applyLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });

export const JoinRequestRoutes = Router();

// ── Customer (logged-in traveller) ──
JoinRequestRoutes.post("/join-requests/apply", auth, applyLimiter, catchAsync(applyToTrip));
JoinRequestRoutes.get("/join-requests/mine", auth, catchAsync(myApplications));
JoinRequestRoutes.post("/join-requests/:id/withdraw", auth, catchAsync(withdrawApplication));

// ── Admin oversight ──
JoinRequestRoutes.get("/admin/join-requests", isAdmin, catchAsync(adminListJoinRequests));
JoinRequestRoutes.post("/admin/join-requests/:id/revoke", isAdmin, catchAsync(adminRevokeJoinRequest));

export default JoinRequestRoutes;
