import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import passport from "passport";

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

export const BookingRouts = Router();
BookingRouts.post(
  "/newBooking",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(newBooking)
);
BookingRouts.delete(
  "/deleteBooking",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(deleteBooking)
);
BookingRouts.get(
  "/getAllBookings",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getAllBookings)
);
BookingRouts.post(
  "/getUserBooking",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getUserBooking)
);
BookingRouts.post(
  "/getBookingsByTripId",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getBookingsByTripId)
);

BookingRouts.post(
  "/getUserHoistoryTripsBookings",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getUserHoistoryTripsBookings)
);
BookingRouts.put(
  "/updateBooking",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(updateBooking)
);
BookingRouts.post(
  "/getAllBookings",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getAllBookings)
);
BookingRouts.get(
  "/GetBookingforDashbord",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(GetBookingforDashbord)
);

// Get all bookings with full payment status
BookingRouts.get(
  "/getFullPaymentBookings",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getFullPaymentBookings)
);

export default BookingRouts;
