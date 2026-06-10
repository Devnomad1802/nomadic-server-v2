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
});

export const UserReviews = mongoose.model("UserReviews", userReviewsSchema);