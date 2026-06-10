import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  Title: { type: String, required: false },
  Name: { type: String, required: false },
  Review: { type: String, required: false },
  Job: { type: String, required: false },
  rating: { type: String, required: false },
  Profile_Image: { type: String, default: null },
  Date: { type: Date, required: false },
  status: { type: Boolean, required: false },
  userId: { type: String, required: false },
});

export const Reviews = mongoose.model("Reviews", userSchema);
