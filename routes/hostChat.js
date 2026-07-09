import { Router } from "express";
import passport from "passport";
import { catchAsync } from "../middlewares/index.js";
import {
  startHostChat,
  getMyHostChats,
  sendHostChatMessage,
  markHostChatRead,
} from "../controllers/hostChat.js";

const HostChatRoutes = Router();
const auth = passport.authenticate("jwt", { session: false });

// Traveller side of the platform chat (host side lives in host-portal).
HostChatRoutes.post("/start", auth, catchAsync(startHostChat));
HostChatRoutes.get("/mine", auth, catchAsync(getMyHostChats));
HostChatRoutes.post("/:id/message", auth, catchAsync(sendHostChatMessage));
HostChatRoutes.post("/:id/read", auth, catchAsync(markHostChatRead));

export default HostChatRoutes;
