import { Router } from "express";
import passport from "passport";
import {
  register,
  login,
  verifyEmail,
  sendMail,
  // sendSMCode,
  verifySMSCode,
  forgetPassword,
  changePassword,
  getAllUsers,
  getUser,
  AdminverifyEmail,
  phoneLogin,
  editUser,
  editinfluencer,
  updateBookmark,
  getBookmarkedTrips,
  getAllTripsWithUserBookmark,
  awsSmsTesting,
  deleteUser,
} from "../controllers/users.js";
import { catchAsync } from "../middlewares/index.js";

export const authRoutes = Router();

// auth routes
authRoutes.post("/register", catchAsync(register));
authRoutes.post("/login", catchAsync(login));
authRoutes.post("/phone-login", catchAsync(phoneLogin));
// authRoutes.post("/InfluencerCheck", catchAsync(InfluencerCheck));
authRoutes.get("/verify-email", catchAsync(verifyEmail));
authRoutes.get("/verify-email-admin", catchAsync(AdminverifyEmail));
authRoutes.post(
  "/sendMail",
  passport.authenticate("jwt", { session: false }),
  catchAsync(sendMail)
);
// authRoutes.post(
//   "/sendSmsCode",
//   passport.authenticate("jwt", { session: false }),
//   catchAsync(sendSMCode)
// );
authRoutes.post(
  "/verifySmsCode",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(verifySMSCode)
);
authRoutes.get("/forgotPassword/:email", catchAsync(forgetPassword));
authRoutes.post("/changepassword", catchAsync(changePassword));

// Get all Users
authRoutes.get("/users", catchAsync(getAllUsers));
authRoutes.get("/user/:id", catchAsync(getUser));
authRoutes.post("/editUser", catchAsync(editUser));
authRoutes.post("/editinfluencer", catchAsync(editinfluencer));
authRoutes.post("/updateBookmark", catchAsync(updateBookmark));
authRoutes.post("/getBookmarkedTrips", catchAsync(getBookmarkedTrips));
authRoutes.post("/awsSmsTesting", catchAsync(awsSmsTesting));
authRoutes.post("/deleteUser", catchAsync(deleteUser));
authRoutes.post(
  "/getAllTripsWithUserBookmark",
  catchAsync(getAllTripsWithUserBookmark)
);

export default authRoutes;
