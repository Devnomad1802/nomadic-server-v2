import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  Name: { type: String, required: false },
  Position: { type: String, required: false },
  Photo: { type: String, default: null },
  Date: { type: Date, required: false },
});

export const TeamMembers = mongoose.model("TeamMembers", userSchema);
