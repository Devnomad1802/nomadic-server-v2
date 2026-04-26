import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import { addCoverImage, getCoverImages } from "../controllers/coverImages.js";
import passport from "passport";

export const CoverImageRouts = Router();
CoverImageRouts.post(
  "/addCoverImage",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(addCoverImage)
);
// CoverImageRouts.delete("/deleteBanner", catchAsync(deleteBanner));
CoverImageRouts.get(
  "/getCoverImages",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getCoverImages)
);

export default CoverImageRouts;
