import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  Category: { type: String, required: false },
  Starting_From: { type: String, required: false },
  Banner_Image: { type: String, default: null },
  Date: { type: Date, required: false },
});

export const Categories = mongoose.model("Categories", userSchema);
