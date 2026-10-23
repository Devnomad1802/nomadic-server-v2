import { Router } from "express";
import { catchAsync, isAdmin } from "../middlewares/index.js";
import {
  initateEnquery,
  getAllEnquries,
  replyEnquery,
  deleteEnqurie,
} from "../controllers/enquire.js";
export const EnquireRouts = Router();
// Public: the website contact form submits here.
EnquireRouts.post(
  "/initateEnquery",
  catchAsync(initateEnquery)
);
// Admin only: reply contains staff response; was any-logged-in-user.
EnquireRouts.post(
  "/replyEnquery",
  isAdmin,
  catchAsync(replyEnquery)
);

// Admin only: this returns customer contact PII (name/email/phone/message) —
// was PUBLIC, exposing every enquiry to anyone.
EnquireRouts.get(
  "/getAllEnquries",
  isAdmin,
  catchAsync(getAllEnquries)
);
EnquireRouts.post(
  "/deleteEnqurie",
  isAdmin,
  catchAsync(deleteEnqurie)
);
export default EnquireRouts;
