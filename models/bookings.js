import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  userId: { type: String, required: false },
  bookingId: { type: String, required: false },
  paymentDetail: { type: String, required: false },
  cardData: { type: String, required: false },
  total: { type: Number, required: false },
  tripId: { type: String, required: false },
  paymentStatus: { type: String, required: false },
  userName: { type: String, required: false },
  coupenDiscount: { type: String, require: false },
  // noOfTravlers: { type: String, required: false },
  // NoOfDays: { type: String, required: false },
  email: { type: String, required: false },
  phone: { type: String, required: false },
  status: { type: String, required: false },
  type: { type: String, required: false },
  // paymentStatus: { type: String, required: false },
  DateOfBooking: { type: Date, required: false },

  // ── Analytics-friendly typed fields (additive; populated going forward) ──
  totalAmount: { type: Number, required: false },       // clean numeric amount
  travelers: { type: Number, required: false },          // number of travellers
  tripName: { type: String, required: false },           // denormalised for reporting
  tripStartDate: { type: Date, required: false },
  gst: { type: Number, required: false },
  discount: { type: Number, required: false },
  source: { type: String, required: false, default: "website" }, // attribution
  bookingStatus: {
    type: String,
    enum: ["pending", "confirmed", "cancelled", "completed"],
    default: "pending",
  },

  payoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', required: false },
}, { timestamps: true });

export const Bookings = mongoose.model("Bookings", userSchema);
