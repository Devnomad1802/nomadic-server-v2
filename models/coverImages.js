import mongoose from "mongoose";

const coverImageSchema = mongoose.Schema({
  home: [{ type: String, required: false }], // Changed to array for multiple images
  homeVideo: { type: String, required: false }, // Added homeVideo field
  allPakeges: { type: String, required: false },
  blog: { type: String, required: false },
  aboutUs: { type: String, required: false },
  contactUS: { type: String, required: false },
  footer: { type: String, default: null },
  aboutSection: { type: String, default: null },
  homeLink: { type: String, required: false }, // Added homeLink field
  toggle: { type: Boolean, default: false }, // Added toggle field
  Date: { type: Date, default: Date.now },
});

export const CoverImages = mongoose.model("CoverImages", coverImageSchema);
