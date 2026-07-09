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
  getMyReviews,
  markMyNotificationsRead,
  updateMyHost,
  submitMyVerification,
  replyToEnquiry,
  markEnquiryRead,
  updateMyTrip,
  uploadMyDocuments,
  activateHost,
} from "../controllers/hostPortal.js";
import {
  submitApplication,
  listApplications,
  updateApplication,
} from "../controllers/hostApplications.js";

/* Host Portal routes — JWT required on every endpoint. Mounted at
 * /api/host-portal (separate mount → zero interference with the existing
 * /api/host/:id admin routes). */

const auth = passport.authenticate("jwt", { session: false });

export const HostPortalRoutes = Router();

// Public: "Become a Host" application intake.
HostPortalRoutes.post("/apply", catchAsync(submitApplication));
// Admin: review host applications.
HostPortalRoutes.get("/applications", auth, catchAsync(listApplications));
HostPortalRoutes.patch("/applications/:id", auth, catchAsync(updateApplication));

HostPortalRoutes.get("/me", auth, catchAsync(getMyHost));
HostPortalRoutes.get("/me/trips", auth, catchAsync(getMyTrips));
HostPortalRoutes.get("/me/bookings", auth, catchAsync(getMyBookings));
HostPortalRoutes.get("/me/enquiries", auth, catchAsync(getMyEnquiries));
HostPortalRoutes.get("/me/overview", auth, catchAsync(getMyOverview));
HostPortalRoutes.put("/me", auth, catchAsync(updateMyHost));
HostPortalRoutes.post("/me/submit-verification", auth, catchAsync(submitMyVerification));
HostPortalRoutes.put("/me/trips/:id", auth, catchAsync(updateMyTrip));
HostPortalRoutes.post("/me/enquiries/:id/reply", auth, catchAsync(replyToEnquiry));
HostPortalRoutes.post("/me/enquiries/:id/read", auth, catchAsync(markEnquiryRead));
HostPortalRoutes.post("/me/documents", auth, catchAsync(uploadMyDocuments));
HostPortalRoutes.get("/me/analytics", auth, catchAsync(getMyAnalytics));
HostPortalRoutes.get("/me/notifications", auth, catchAsync(getMyNotifications));
HostPortalRoutes.get("/me/reviews", auth, catchAsync(getMyReviews));
HostPortalRoutes.post("/me/notifications/read", auth, catchAsync(markMyNotificationsRead));

// Admin-only: approve a host application → create/link login + email credentials.
HostPortalRoutes.post("/activate/:hostId", auth, catchAsync(activateHost));

export default HostPortalRoutes;
