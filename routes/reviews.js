import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import {
  addReview,
  getAllReviews,
  deleteReview,
  updateReview,
} from "../controllers/reviews.js";
import passport from "passport";

export const ReviewRouts = Router();
ReviewRouts.post("/addReview", catchAsync(addReview));
ReviewRouts.delete("/deleteReview", catchAsync(deleteReview));
ReviewRouts.get("/getAllReviews", catchAsync(getAllReviews));
ReviewRouts.post("/updateReview", catchAsync(updateReview));

export default ReviewRouts;
