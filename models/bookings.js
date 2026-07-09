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

  // ── Structured booking details (new booking flow) ──
  travellers: [
    {
      name: { type: String, required: false },
      age: { type: String, required: false },
      gender: { type: String, required: false },
      phone: { type: String, required: false },
      email: { type: String, required: false },
      city: { type: String, required: false },
      isLead: { type: Boolean, default: false },
    },
  ],
  emergencyContact: {
    name: { type: String, required: false },
    phone: { type: String, required: false },
    relation: { type: String, required: false },
  },
  dietary: { type: String, required: false },
  batchDate: { type: String, required: false },
  roomType: { type: String, required: false },
  couponCode: { type: String, required: false },

  // ── Secure payment flow (C1/C2) — required for createSecureOrder/confirmBooking ──
  razorpayOrderId: { type: String, required: false },
  razorpayPaymentId: { type: String, required: false },
  orderAmount: { type: Number, required: false },   // amount charged this transaction
  fullTripAmount: { type: Number, required: false }, // full price of the trip
  batchIndex: { type: Number, required: false },
  travellersCount: { type: Number, required: false },
  paymentType: { type: String, required: false },    // "full" | "firstPayment"

  // ── Balance top-up (paying remaining of a firstPayment booking) ──
  balanceOrderId: { type: String, required: false },
  balanceAmount: { type: Number, required: false },

  payoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', required: false },
});

userSchema.index({ razorpayOrderId: 1 }, { sparse: true });
userSchema.index({ balanceOrderId: 1 }, { sparse: true });

export const Bookings = mongoose.model("Bookings", userSchema);
