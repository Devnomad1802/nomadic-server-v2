import { Router } from "express";
import passport from "passport";
import { catchAsync } from "../middlewares/index.js";
import {
  getMyHost,
  getMyTrips,
  getMyBookings,
  getMyEnquiries,
  getMyOverview,
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

export default HostPortalRoutes;
