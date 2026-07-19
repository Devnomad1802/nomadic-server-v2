import mongoose from "mongoose";

// Atomic sequence counters (invoice numbers etc.).
// findOneAndUpdate + $inc is atomic in Mongo — no duplicates under load.
const counterSchema = mongoose.Schema({
  _id: { type: String },          // e.g. "invoice-LIVE-2026"
  seq: { type: Number, default: 0 },
});

export const Counters = mongoose.model("Counters", counterSchema);
