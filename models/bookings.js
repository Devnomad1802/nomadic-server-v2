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
  // packagePricePerHead: { type: String, required: false },
  // Amount: { type: String, required: false },
  // gst: { type: String, required: false },
  // discount: { type: String, required: false },
  // totalAmount: { type: String, required: false },
  // dropOf: { type: String, required: false },
  // tripStartDate: { type: Date, required: false },
  // tripEndDate: { type: Date, required: false },
  DateOfBooking: { type: Date, required: false },
  // tripName: { type: String, required: false },

  payoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', required: false },
});

export const Bookings = mongoose.model("Bookings", userSchema);
