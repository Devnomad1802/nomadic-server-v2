import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import {
  addCoupon,
  getAllCoupon,
  deleteCoupon,
  getCouponTypeList,
  updateCoupon,
} from "../controllers/coupons.js";
import passport from "passport";

export const CouponRouts = Router();
CouponRouts.post(
  "/addCoupon",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(addCoupon)
);
CouponRouts.post(
  "/updateCoupon",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(updateCoupon)
);

CouponRouts.delete(
  // "/deleteCoupon",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(deleteCoupon)
);
CouponRouts.get(
  "/getAllCoupon",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getAllCoupon)
);
CouponRouts.get(
  "/getCouponTypeList",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getCouponTypeList)
);

export default CouponRouts;
