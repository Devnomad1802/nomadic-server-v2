import mongoose from "mongoose";

const itemSchema = {
  order: { type: Number, required: true },
  type: { type: String, enum: ["content", "image"], required: true },
  content: { type: String, required: false },
  imageIndex: { type: Number, required: false },
  imageUrl: { type: String, required: false },
};

const userSchema = mongoose.Schema({
  title: { type: String, required: false },
  author: { type: String, required: false },
  content1: { type: String, required: false }, // Keep for backward compatibility
  content2: { type: String, required: false }, // Keep for backward compatibility
  location: { type: String, required: false },
  Banner_Image: { type: String, default: null },
  Add_Image: [{ type: String }], // Keep for backward compatibility
  items: [itemSchema], // New structured content array
  images: [{ type: String }], // Array of image URLs in order
  metaDescription: { type: String, required: false, default: "" },
  seoSlug: { type: String, required: false, default: "" },
  seoTitle: { type: String, required: false, default: "" },
  Date: { type: Date, required: false },
});

export const Blogs = mongoose.model("Blogs", userSchema);
