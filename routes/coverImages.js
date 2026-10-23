import { Router } from "express";
import { catchAsync, isAdmin } from "../middlewares/index.js";
import { addCoverImage, getCoverImages, updateCategorySection } from "../controllers/coverImages.js";
import passport from "passport";

export const CoverImageRouts = Router();
CoverImageRouts.post(
  "/addCoverImage",
  isAdmin,
  catchAsync(addCoverImage)
);
CoverImageRouts.post(
  "/updateCategorySection",
  isAdmin,
  catchAsync(updateCategorySection)
);
// CoverImageRouts.delete("/deleteBanner", catchAsync(deleteBanner));
CoverImageRouts.get(
  "/getCoverImages",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getCoverImages)
);

export default CoverImageRouts;
