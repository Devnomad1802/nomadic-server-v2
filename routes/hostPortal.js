import { Router } from "express";
import passport from "passport";
import { catchAsync } from "../middlewares/index.js";
import {
  getMyHost,
  getMyTrips,
  getMyBookings,
  getMyEnquiries,
  getMyOverview,
  getMyAnalytics,
  getMyNotifications,
  markMyNotificationsRead,
  activateHost,
} from "../controllers/hostPortal.js";

/* Host Portal routes — JWT required on every endpoint. Mounted at
 * /api/host-portal (separate mount → zero interference with the existing
 * /api/host/:id admin routes). */

const auth = passport.authenticate("jwt", { session: false });

export const HostPortalRoutes = Router();

HostPortalRoutes.get("/me", auth, catchAsync(getMyHost));
HostPortalRoutes.get("/me/trips", auth, catchAsync(getMyTrips));
HostPortalRoutes.get("/me/bookings", auth, catchAsync(getMyBookings));
HostPortalRoutes.get("/me/enquiries", auth, catchAsync(getMyEnquiries));
HostPortalRoutes.get("/me/overview", auth, catchAsync(getMyOverview));
HostPortalRoutes.get("/me/analytics", auth, catchAsync(getMyAnalytics));
HostPortalRoutes.get("/me/notifications", auth, catchAsync(getMyNotifications));
HostPortalRoutes.post("/me/notifications/read", auth, catchAsync(markMyNotificationsRead));

// Admin-only: approve a host application → create/link login + email credentials.
HostPortalRoutes.post("/activate/:hostId", auth, catchAsync(activateHost));

export default HostPortalRoutes;
