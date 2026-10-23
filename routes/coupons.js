import { Router } from "express";
import { catchAsync, isAdmin } from "../middlewares/index.js";
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
  isAdmin,
  catchAsync(addCoupon)
);
CouponRouts.post(
  "/updateCoupon",
  isAdmin,
  catchAsync(updateCoupon)
);

CouponRouts.delete(
  "/deleteCoupon",
  isAdmin,
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
