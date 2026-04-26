import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
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
  // passport.authenticate("jwt", { session: false }),
  catchAsync(addBanner)
);
BannerRouts.delete(
  "/deleteBanner",
  // passport.authenticate("jwt", { session: false }),
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
  // passport.authenticate("jwt", { session: false }),
  catchAsync(deleteBannerCardImage)
);
BannerRouts.post(
  "/uploadCardImage",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(uploadBannerCardImage)
);

export default BannerRouts;
