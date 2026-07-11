import mongoose from "mongoose";

const userReviewsSchema = mongoose.Schema({
    userId: { type: String, required: false },
    tripId: { type: String, required: false },
    hostId: { type: String, required: false },
    rating: { type: Number, default: 0 },
    review: { type: String, default: "" },
    name: { type: String, default: "" },
    tripName: { type: String, default: "" },
    profileImage: { type: String, default: null },
    date: { type: Date, required: false },

    // --- Entity scoping & provenance (reviews system refactor) ---
    // Which entity this review belongs to. Host reviews are host-scoped and
    // must never be shown on brand surfaces (and vice-versa).
    entityType: {
        type: String,
        enum: ["host", "trip"],
        // default derived in the controller from hostId / tripId
    },
    // Where the review came from. "traveller" = submitted on-site by a guest,
    // "manual" = added by an admin, "google" = a cached Google review.
    source: {
        type: String,
        enum: ["traveller", "manual", "google"],
        default: "traveller",
    },
    location: { type: String, default: "" },
    // For cached Google reviews: stable id (dedupe) + author profile link.
    externalId: { type: String, default: null },
    googleAuthorUrl: { type: String, default: null },

    // --- Post-trip review system ---
    // Ties a traveller review to the exact booking that earned it.
    bookingId: { type: String },
    // Moderation: approved by default; admin can reject to hide.
    status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "approved",
    },
    photos: [{ type: String }],
    wouldRecommend: { type: Boolean, default: null },
}, { timestamps: true });

// One review per booking — unique ONLY among reviews that actually have a
// bookingId (traveller post-trip reviews). Admin/manual/google reviews have no
// bookingId and must not collide with each other, so a plain sparse index is
// wrong (it treats null as a value). Partial filter = string bookingId only.
userReviewsSchema.index(
  { bookingId: 1 },
  { unique: true, partialFilterExpression: { bookingId: { $type: "string" } } },
);

export const UserReviews = mongoose.model("UserReviews", userReviewsSchema);