import mongoose from "mongoose";

/* Notifications (Host Dashboard) — new collection, fully additive.
 * recipientType keeps the door open for admin/traveler notifications later. */
const notificationSchema = mongoose.Schema(
  {
    recipientType: { type: String, enum: ["host", "admin", "user"], default: "host" },
    recipientId: { type: String, required: true }, // Host._id (or User._id for admin/user)
    type: { type: String, required: false }, // trip_approved | trip_rejected | changes_requested | account | booking | enquiry
    title: { type: String, required: false },
    body: { type: String, required: false },
    isRead: { type: Boolean, default: false },
    data: { type: Object, required: false }, // optional payload (tripId etc.)
  },
  { timestamps: true }
);

notificationSchema.index({ recipientType: 1, recipientId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);
