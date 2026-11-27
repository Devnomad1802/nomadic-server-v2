import { Router } from "express";
import passport from "passport";
import { catchAsync } from "../middlewares/index.js";
import { isAdmin } from "../middlewares/isAdmin.js";
import {
  startHostChat,
  getMyHostChats,
  getUnreadCount,
  sendHostChatMessage,
  markHostChatRead,
  getAdminConversations,
  getAdminConversation,
} from "../controllers/hostChat.js";

const HostChatRoutes = Router();
const auth = passport.authenticate("jwt", { session: false });

// Traveller side of the platform chat (host side lives in host-portal).
HostChatRoutes.post("/start", auth, catchAsync(startHostChat));
HostChatRoutes.get("/mine", auth, catchAsync(getMyHostChats));
HostChatRoutes.get("/unread-count", auth, catchAsync(getUnreadCount));
HostChatRoutes.post("/:id/message", auth, catchAsync(sendHostChatMessage));
HostChatRoutes.post("/:id/read", auth, catchAsync(markHostChatRead));

// Admin monitoring (read-only, admin-only).
HostChatRoutes.get("/admin/conversations", isAdmin, catchAsync(getAdminConversations));
HostChatRoutes.get("/admin/conversations/:id", isAdmin, catchAsync(getAdminConversation));

export default HostChatRoutes;
