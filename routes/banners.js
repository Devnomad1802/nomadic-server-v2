import { Router } from "express";
import { catchAsync, isAdmin } from "../middlewares/index.js";
import {
  addBanner,
  getAllBanner,
  deleteBanner,
  deleteBannerCardImage,
  uploadBannerCardImage,
} from "../controllers/banners.js";
import passport from "passport";

export const BannerRouts = Router();
BannerRouts.post(
  "/addBanner",
  isAdmin,
  catchAsync(addBanner)
);
BannerRouts.delete(
  "/deleteBanner",
  isAdmin,
  catchAsync(deleteBanner)
);
BannerRouts.get(
  "/getAllBanner",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getAllBanner)
);

// Single card image management
BannerRouts.delete(
  "/deleteCardImage",
  isAdmin,
  catchAsync(deleteBannerCardImage)
);
BannerRouts.post(
  "/uploadCardImage",
  isAdmin,
  catchAsync(uploadBannerCardImage)
);

export default BannerRouts;
