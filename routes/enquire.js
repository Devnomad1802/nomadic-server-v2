import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import {
  initateEnquery,
  getAllEnquries,
  replyEnquery,
  deleteEnqurie,
} from "../controllers/enquire.js";
import passport from "passport";
export const EnquireRouts = Router();
EnquireRouts.post(
  "/initateEnquery",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(initateEnquery)
);
EnquireRouts.post(
  "/replyEnquery",
  passport.authenticate("jwt", { session: false }),
  catchAsync(replyEnquery)
);

// EnquireRouts.delete("/deleteReview", catchAsync(deleteReview));
EnquireRouts.get(
  "/getAllEnquries",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getAllEnquries)
);
EnquireRouts.post(
  "/deleteEnqurie",
  passport.authenticate("jwt", { session: false }),
  catchAsync(deleteEnqurie)
);
export default EnquireRouts;
