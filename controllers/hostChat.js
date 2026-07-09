import { Enquire, Host } from "../models/index.js";
import { containsContactInfo, CONTACT_WARNING } from "../utils/contactModeration.js";

// ─────────────────────────────────────────────────────────────
// Platform chat between a logged-in traveller and a host.
// One Enquire doc per (userId, hostId) pair holds the thread.
// All messages pass contact-sharing moderation; blocked messages
// are never stored and repeated violations pause the chat 1 hour.
// ─────────────────────────────────────────────────────────────

const PAUSE_AFTER = 3; // violations
const PAUSE_MS = 60 * 60 * 1000; // 1 hour

// Returns an error response if the message can't be sent, else null.
const moderate = async (convo, text, res) => {
  const paused = convo?.moderation?.pausedUntil && new Date(convo.moderation.pausedUntil) > new Date();
  if (paused) {
    res.status(429).json({ code: "CHAT_PAUSED", error: "Chat is paused for a while after repeated attempts to share contact details. Try again later." });
    return true;
  }
  if (containsContactInfo(text)) {
    if (convo) {
      convo.moderation = convo.moderation || {};
      convo.moderation.violations = (convo.moderation.violations || 0) + 1;
      if (convo.moderation.violations >= PAUSE_AFTER) {
        convo.moderation.pausedUntil = new Date(Date.now() + PAUSE_MS);
        convo.moderation.violations = 0;
      }
      await convo.save();
    }
    res.status(422).json({ code: "CONTACT_BLOCKED", error: CONTACT_WARNING });
    return true;
  }
  return false;
};

// POST /host-chat/start  { hostId, message }  (user JWT)
export const startHostChat = async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { hostId, message } = req.body || {};
  if (!hostId || !String(message || "").trim()) {
    return res.status(400).json({ error: "hostId and message are required" });
  }
  const host = await Host.findById(hostId).select("hostName hostTitle brandingLogo");
  if (!host) return res.status(404).json({ error: "Host not found" });

  let convo = await Enquire.findOne({ userId: String(userId), hostId: String(hostId) });
  if (await moderate(convo, message, res)) return;

  const text = String(message).trim().slice(0, 2000);
  if (!convo) {
    convo = await Enquire.create({
      userId: String(userId),
      hostId: String(hostId),
      Name: req.user?.name || "",
      Message: text,
      status: "Open",
      Date: new Date(),
      chat: [{ MessageBy: "user", Message: text, timeStamp: new Date() }],
      hostUnread: 1,
      userUnread: 0,
    });
  } else {
    convo.chat = convo.chat || [];
    convo.chat.push({ MessageBy: "user", Message: text, timeStamp: new Date() });
    convo.status = "Open";
    convo.Date = new Date();
    convo.hostUnread = (convo.hostUnread || 0) + 1;
    await convo.save();
  }
  return res.status(201).json({ success: true, data: convo });
};

// GET /host-chat/mine  (user JWT) — user's conversations with host names.
export const getMyHostChats = async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const convos = await Enquire.find({ userId: String(userId), hostId: { $ne: null } }).sort({ Date: -1 });
  const hostIds = [...new Set(convos.map((c) => c.hostId).filter(Boolean))];
  const hosts = await Host.find({ _id: { $in: hostIds } }).select("hostName hostTitle brandingLogo isVerified");
  const hostMap = Object.fromEntries(hosts.map((h) => [String(h._id), h]));
  const data = convos.map((c) => ({
    _id: c._id,
    hostId: c.hostId,
    host: hostMap[c.hostId]
      ? {
          name: hostMap[c.hostId].hostTitle || hostMap[c.hostId].hostName,
          logo: hostMap[c.hostId].brandingLogo || null,
          verified: !!hostMap[c.hostId].isVerified,
        }
      : null,
    chat: c.chat || [],
    userUnread: c.userUnread || 0,
    status: c.status,
    Date: c.Date,
  }));
  return res.status(200).json({ success: true, data });
};

// POST /host-chat/:id/message  { message }  (user JWT)
export const sendHostChatMessage = async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { message } = req.body || {};
  if (!String(message || "").trim()) return res.status(400).json({ error: "Message is required" });

  const convo = await Enquire.findOne({ _id: req.params.id, userId: String(userId) });
  if (!convo) return res.status(404).json({ error: "Conversation not found" });
  if (await moderate(convo, message, res)) return;

  convo.chat = convo.chat || [];
  convo.chat.push({ MessageBy: "user", Message: String(message).trim().slice(0, 2000), timeStamp: new Date() });
  convo.status = "Open";
  convo.Date = new Date();
  convo.hostUnread = (convo.hostUnread || 0) + 1;
  await convo.save();
  return res.status(200).json({ success: true, data: convo });
};

// POST /host-chat/:id/read  (user JWT) — clear the user's unread counter.
export const markHostChatRead = async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const convo = await Enquire.findOneAndUpdate(
    { _id: req.params.id, userId: String(userId) },
    { userUnread: 0 },
    { new: true },
  );
  if (!convo) return res.status(404).json({ error: "Conversation not found" });
  return res.status(200).json({ success: true });
};
