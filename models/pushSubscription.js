import mongoose from "mongoose";

// One row per host device/browser push subscription. Additive collection —
// does not touch existing models. endpoint is unique (re-subscribe upserts).
const pushSubscriptionSchema = new mongoose.Schema(
  {
    hostId: { type: String, required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
  },
  { timestamps: true },
);

export const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema);
export default PushSubscription;
