import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  Select_Coupon_type: { type: String, required: false },
  Coupon_Title: { type: String, required: false },
  Description: { type: String, required: false },
  Coupon_Name: { type: String, required: false },
  Coupon_percentage: { type: String, required: false },
  Date: { type: Date, required: false },
});

export const Coupon = mongoose.model("Coupon", userSchema);
