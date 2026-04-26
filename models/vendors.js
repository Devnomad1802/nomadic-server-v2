import mongoose from "mongoose";
const vendorSchema = mongoose.Schema({
  First_Name: String,
  Last_Name: String,
  Email: String,
  Mobile_1: String,
  Mobile_2: String,
  Location: String,
  Remarks: String,

  isLoggedIn: { type: Boolean, default: false },
});
export const Vendor = mongoose.model("Vendor", vendorSchema);
