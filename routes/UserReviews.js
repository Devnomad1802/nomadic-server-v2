// ------------------------- user review routes -------------------------
import { Router } from "express";
import { catchAsync, uploadCoverImagesToS3 } from "../middlewares/index.js";
import { addUserReview, getUserReviews, getAllUsersReviews, getAllReviewsByHostId, getuserReviewsByTripId } from "../controllers/UserReviews.js";

export const UserReviewsRoutes = Router();

// Add a new user review with profile image upload to S3
// Using uploadCoverImagesToS3 which accepts ANY field name (more flexible)
// This prevents "Unexpected field" errors regardless of what the frontend sends
UserReviewsRoutes.post("/addUserReview", uploadCoverImagesToS3(), catchAsync(addUserReview));

// Get all reviews for a user (supports both query params and body)
// Usage: GET /getUserReviews?userId=123 or POST /getUserReviews with {userId: "123"}
UserReviewsRoutes.get("/getUserReviews", catchAsync(getUserReviews));
UserReviewsRoutes.post("/getUserReviews", catchAsync(getUserReviews));

// Get all users reviews (with optional pagination and filtering)
// Usage: GET /getAllUsersReviews?page=1&limit=20&tripName=Desert
UserReviewsRoutes.get("/getAllUsersReviews", catchAsync(getAllUsersReviews));

// Get all reviews by host ID (supports params, query, or body)
// Usage: 
//   GET /getAllReviewsByHostId/:hostId
//   GET /getAllReviewsByHostId?hostId=123&page=1&limit=20
//   POST /getAllReviewsByHostId/:hostId (with optional pagination in body)
//   POST /getAllReviewsByHostId (with hostId in body)
UserReviewsRoutes.get("/getAllReviewsByHostId/:hostId", catchAsync(getAllReviewsByHostId));
UserReviewsRoutes.post("/getAllReviewsByHostId/:hostId", catchAsync(getAllReviewsByHostId));
UserReviewsRoutes.get("/getAllReviewsByHostId", catchAsync(getAllReviewsByHostId));
UserReviewsRoutes.post("/getAllReviewsByHostId", catchAsync(getAllReviewsByHostId));
UserReviewsRoutes.get("/getUserReviewsByHostId/:tripId", catchAsync(getuserReviewsByTripId));

export default UserReviewsRoutes;