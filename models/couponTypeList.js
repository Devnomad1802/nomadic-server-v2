import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  couponTypeList: [{ type: String }],
  Date: { type: Date, required: false },
});

export const CouponTypeList = mongoose.model("CouponTypeList", userSchema);
