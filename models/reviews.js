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

  // --- Brand (Nomadic Townies) review provenance (reviews system refactor) ---
  // These reviews belong only to the brand and are shown on brand surfaces
  // (home / about / all-packages / trip / category) — never on host pages.
  source: {
    type: String,
    enum: ["manual", "google"],
    default: "manual",
  },
  location: { type: String, default: "" },
  tripName: { type: String, default: "" },
  // For cached Google reviews.
  externalId: { type: String, default: null },
  googleAuthorUrl: { type: String, default: null },
});

export const Reviews = mongoose.model("Reviews", userSchema);
