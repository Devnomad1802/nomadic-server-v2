import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import passport from "passport";
import { isAdmin } from "../middlewares/isAdmin.js";

import {
  newBooking,
  deleteBooking,
  getUserBooking,
  getBookingsByTripId,
  getUserHoistoryTripsBookings,
  updateBooking,
  getAllBookings,
  GetBookingforDashbord,
  getFullPaymentBookings,
} from "../controllers/bookings.js";

const auth = passport.authenticate("jwt", { session: false });

export const BookingRouts = Router();

// ── Authenticated user endpoints (logged-in customer) ──
BookingRouts.post("/newBooking", auth, catchAsync(newBooking));
BookingRouts.delete("/deleteBooking", auth, catchAsync(deleteBooking));
BookingRouts.post("/getUserBooking", auth, catchAsync(getUserBooking));
BookingRouts.post(
  "/getUserHoistoryTripsBookings",
  auth,
  catchAsync(getUserHoistoryTripsBookings)
);
BookingRouts.put("/updateBooking", auth, catchAsync(updateBooking));

// ── Admin-only endpoints (full lists / dashboard / revenue) ──
BookingRouts.get("/getAllBookings", isAdmin, catchAsync(getAllBookings));
BookingRouts.post("/getAllBookings", isAdmin, catchAsync(getAllBookings));
BookingRouts.post("/getBookingsByTripId", isAdmin, catchAsync(getBookingsByTripId));
BookingRouts.get("/GetBookingforDashbord", isAdmin, catchAsync(GetBookingforDashbord));
BookingRouts.get("/getFullPaymentBookings", isAdmin, catchAsync(getFullPaymentBookings));

export default BookingRouts;
