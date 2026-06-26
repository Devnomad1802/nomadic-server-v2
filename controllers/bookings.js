import { Bookings, Trips } from "../models/index.js";
import { User } from "../models/index.js";
import mongoose from "mongoose";

import { uploadFiles } from "../middlewares/index.js";
export const newBooking = async (req, res) => {
  //   const fields = [
  //     { name: "Add_Image", maxCount: 20 },
  //     { name: "Banner_Image", maxCount: 1 },
  //   ];
  //   uploadFiles(fields)(req, res, async (err) => {
  //     if (err) {
  //       return res.status(500).json({ error: "Failed to upload files" });
  //     }

  try {
    //   let Add_Image;
    //   if (req.files["Add_Image"]) {
    //     Add_Image = req.files["Add_Image"].map(
    //       (file) => "/uploads/" + file.filename
    //     );
    //   }
    //   let Banner_Image;
    //   if (req.files["Banner_Image"] && req.files["Banner_Image"].length > 0) {
    //     Banner_Image = req.files["Banner_Image"][0]
    //       ? "/uploads/" + req.files["Banner_Image"][0].filename
    //       : null;
    //   }
    // Always bind the booking to the authenticated user (never trust body userId).
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user;

    // Idempotency guard: the same Razorpay payment must not create two bookings
    // (protects against double-submit / replay of the success handler).
    if (req.body.bookingId) {
      const existing = await Bookings.findOne({ bookingId: req.body.bookingId });
      if (existing) {
        return res
          .status(200)
          .json({ message: "Booking already recorded", data: existing });
      }
    }

    const newBooking = new Bookings({
      userId: `${userId}`,
      bookingId: req.body.bookingId,
      tripId: req.body.paymentDetail?._id,
      paymentStatus: req.body.paymentStatus,
      paymentDetail: JSON.stringify(req.body.paymentDetail),
      cardData: JSON.stringify(req.body.cardData),
      total: req.body.selectedValue,
      email: user.email,
      phone: user.phone,
      userName: user.name,
      status: req.body.status,
      type: req.body.type,
      coupenDiscount: req.body.coupenDiscount,
      // ── structured booking details (new booking flow; optional/back-compatible) ──
      travellers: Array.isArray(req.body.travellers) ? req.body.travellers : undefined,
      emergencyContact: req.body.emergencyContact || undefined,
      dietary: req.body.dietary,
      batchDate: req.body.batchDate,
      roomType: req.body.roomType,
      couponCode: req.body.couponCode,
      // paymentStatus: req.body.paymentStatus,
      // packagePricePerHead: req.body.packagePricePerHead,
      // Amount: req.body.Amount,
      // gst: req.body.gst,
      // discount: req.body.discount,
      // totalAmount: req.body.totalAmount,
      // dropOf: req.body.dropOf,
      // tripEndDate: req.body.tripEndDate,
      // paymentStatus: "Successful",
      DateOfBooking: new Date(new Date().toUTCString()),
      // tripName: req.body.tripName,
    });

    await newBooking.save();

    return res
      .status(200)
      .json({ message: "Trip added successfully", data: newBooking });
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
  //   });
};

// ------------------------- get user bookings -------------------------
export const getUserBooking = async (req, res) => {
  try {
    // Ownership: always scope to the authenticated user — never trust body userId.
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const bookings = await Bookings.find({ userId: `${userId}` });

    // Respond with the list of bookings
    return res
      .status(200)
      .json({ message: "All bookings retrieved successfully", data: bookings });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ------------------------- delete booking -------------------------
export const deleteBooking = async (req, res) => {
  try {
    // Ownership: a user may only delete their own booking (admins may delete any).
    const booking = await Bookings.findById(req.body._id);
    if (!booking) return res.status(400).send("NO DATA FOUND");
    const isOwner = `${booking.userId}` === `${req.user?._id}`;
    if (!isOwner && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    await booking.deleteOne();
    return res.status(200).send("DELETED");
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ------------------------- get bookings by trip id -------------------------
export const getBookingsByTripId = async (req, res) => {
  try {
    console.log("tripid ....", req.body.tripId);
    const bookings = await Bookings.find({ tripId: req.body.tripId });
    // const userIds = bookings.map((booking) => booking.userId);
    // const users = await User.find({ _id: { $in: userIds } });
    return res.status(200).json({
      message: "All bookings retrieved successfully",
      data: bookings,
    });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ------------------------- get user bookings History -------------------------
export const getUserHoistoryTripsBookings = async (req, res) => {
  try {
    // Ownership: scope to the authenticated user — never trust body userId.
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Get all bookings for the user (no filter)
    const bookings = await Bookings.find({
      userId: `${userId}`,
    }).sort({ DateOfBooking: -1 });

    if (!bookings || bookings.length === 0) {
      return res.status(200).json({
        message: "Bookings retrieved successfully",
        data: [],
        bookings: []
      });
    }

    // Extract unique tripIds from bookings
    const tripIdStrings = bookings
      .map(booking => booking.tripId)
      .filter(tripId => tripId && tripId !== 'null' && tripId !== 'undefined' && tripId !== '');

    // Convert tripIds to ObjectId format for querying
    const tripIds = tripIdStrings
      .filter(tripId => mongoose.Types.ObjectId.isValid(tripId))
      .map(tripId => new mongoose.Types.ObjectId(tripId));

    // Fetch all trips related to the user's bookings
    let trips = [];
    if (tripIds.length > 0) {
      trips = await Trips.find({
        _id: { $in: tripIds }
      })
        .populate('host')
        .sort({ date: -1 });
    }

    // Create a map of tripId to trip for easy lookup
    const tripMap = {};
    trips.forEach(trip => {
      tripMap[trip._id.toString()] = trip;
    });

    // Attach trip details to each booking
    const bookingsWithTrips = bookings.map(booking => {
      const bookingObj = booking.toObject();
      // Find matching trip for this booking
      if (booking.tripId && mongoose.Types.ObjectId.isValid(booking.tripId)) {
        const tripIdStr = new mongoose.Types.ObjectId(booking.tripId).toString();
        bookingObj.trip = tripMap[tripIdStr] || null;
      } else {
        bookingObj.trip = null;
      }
      return bookingObj;
    });

    return res.status(200).json({
      message: "User bookings retrieved successfully",
      data: bookingsWithTrips,
      bookingsCount: bookings.length,
      tripsCount: trips.length
    });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving user bookings:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message
    });
  }
};

// ------------------------- update booking -------------------------
export const updateBooking = async (req, res) => {
  try {
    const ub = await Bookings.findOne({ _id: req.body._id });
    if (!ub) return res.status(404).json({ error: "Booking not found" });

    // Ownership: owner or admin only.
    const isOwner = `${ub.userId}` === `${req.user?._id}`;
    const isAdminUser = req.user?.role === "Admin";
    if (!isOwner && !isAdminUser) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Money-integrity: only an admin may mutate financial fields. A customer
    // must never be able to set their own paymentStatus/total.
    if (isAdminUser) {
      if (req.body.paymentStatus !== undefined) ub.paymentStatus = req.body.paymentStatus;
      if (req.body.total !== undefined) ub.total = req.body.total;
    }
    if (req.body.status !== undefined) ub.status = req.body.status;

    await ub.save();
    return res
      .status(200)
      .json({ message: "Booking update  successfully", data: ub });
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
  //   });
};


// ------------------------- get all bookings -------------------------
export const getAllBookings = async (req, res) => {
  try {
    const search = req.query.search || "";
    const { status } = req.body || "All";
    if (status == "" || status == "All") {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      const trips = await Bookings.find({
        $or: [
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { userName: { $regex: search, $options: "i" } },
        ],
      })
        .limit(limit)
        .skip(skip)
        .sort({ DateOfBooking: -1 });
      const totalTrips = await Bookings.countDocuments({
        $or: [
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { userName: { $regex: search, $options: "i" } },
        ],
      });
      return res.status(200).json({
        message: "Trips retrieved successfully",
        data: trips,
        currentPage: page,
        totalPages: Math.ceil(totalTrips / limit),
        totalTrips,
      });
    } else {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      const trips = await Bookings.find({
        status: status,
        $or: [
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { userName: { $regex: search, $options: "i" } },
        ],
      })
        .limit(limit)
        .skip(skip)
        .sort({ DateOfBooking: -1 });
      const totalTrips = await Bookings.countDocuments({
        status: status,
        $or: [
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { userName: { $regex: search, $options: "i" } },
        ],
      });
      return res.status(200).json({
        message: "Trips retrieved successfully",
        data: trips,
        currentPage: page,
        totalPages: Math.ceil(totalTrips / limit),
        totalTrips,
      });
    }
  } catch (error) {
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ------------------------- get bookings for dashboard -------------------------
export const GetBookingforDashbord = async (req, res) => {
  try {
    const trips = await Bookings.find().sort({ _id: -1 }).limit(10);
    return res.status(200).json({
      message: "Trips retrieved successfully",
      data: trips,
    });
  } catch (error) {
    // Handle any errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ------------------------- get full payment bookings -------------------------
export const getFullPaymentBookings = async (req, res) => {
  try {
    const { sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Build query for full payment bookings
    const query = { paymentStatus: 'fullPayment' };

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get all full payment bookings and populate user and payout details
    const bookings = await Bookings.find(query)
      .sort(sort)
      .populate('userId', 'name email phone')
      .populate('payoutId');

    return res.status(200).json({
      success: true,
      message: 'Full payment bookings retrieved successfully',
      data: bookings,
      count: bookings.length
    });

  } catch (error) {
    console.error('Error fetching full payment bookings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch full payment bookings',
      error: error.message
    });
  }
};
