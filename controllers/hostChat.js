import { Enquire, Host } from "../models/index.js";
import { containsContactInfo, CONTACT_WARNING } from "../utils/contactModeration.js";
import { validateMessage, serializeChatForParticipant, serializeEnquiryForParticipant, orderChatAsc } from "../utils/chatSerialize.js";
import { emitToHost } from "../services/hostEvents.js";
import { sendPushToHost } from "../services/webPush.js";

// Notify a host of a new customer message: realtime SSE + web push.
// Payload carries NO message body or customer PII — only an opaque deep link.
const notifyHostMessage = (hostId, enquiryId, hostUnread) => {
  emitToHost(hostId, { type: "message", enquiryId: String(enquiryId), hostUnread: hostUnread || 0 });
  // Fire-and-forget; never blocks the reply path.
  sendPushToHost(hostId, {
    title: "New message",
    body: "You have a new message on Nomadic Townies. Open your inbox to reply.",
    url: `/enquiries?convo=${enquiryId}`,
  }).catch(() => {});
};

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
  if (!hostId) return res.status(400).json({ error: "hostId is required" });
  const { text, error } = validateMessage(message);
  if (error) return res.status(400).json({ error });
  const host = await Host.findById(hostId).select("hostName hostTitle brandingLogo");
  if (!host) return res.status(404).json({ error: "Host not found" });

  let convo = await Enquire.findOne({ userId: String(userId), hostId: String(hostId) });
  if (await moderate(convo, text, res)) return;

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
  notifyHostMessage(hostId, convo._id, convo.hostUnread);
  return res.status(201).json({ success: true, data: serializeEnquiryForParticipant(convo) });
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
    chat: serializeChatForParticipant(c.chat),
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
  const { text, error } = validateMessage(req.body?.message);
  if (error) return res.status(400).json({ error });

  const convo = await Enquire.findOne({ _id: req.params.id, userId: String(userId) });
  if (!convo) return res.status(404).json({ error: "Conversation not found" });
  if (await moderate(convo, text, res)) return;

  convo.chat = convo.chat || [];
  convo.chat.push({ MessageBy: "user", Message: text, timeStamp: new Date() });
  convo.status = "Open";
  convo.Date = new Date();
  convo.hostUnread = (convo.hostUnread || 0) + 1;
  await convo.save();
  notifyHostMessage(convo.hostId, convo._id, convo.hostUnread);
  return res.status(200).json({ success: true, data: serializeEnquiryForParticipant(convo) });
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

// ─────────────────────────────────────────────────────────────
// Admin monitoring (Admin → Host Messages). Read-only, admin-only.
// Surfaces host<->traveller conversations with participants, trip, last message,
// unread + moderation flags. Blocked (contact-sharing) messages are never stored,
// so only platform-allowed messages appear; flags come from the moderation counters.
// ─────────────────────────────────────────────────────────────
import { Trips } from "../models/index.js";

const isFlagged = (c) =>
  (c?.moderation?.violations || 0) > 0 ||
  (c?.moderation?.pausedUntil && new Date(c.moderation.pausedUntil) > new Date());

// GET /api/host-chat/admin/conversations?page&limit&search&flagged
export const getAdminConversations = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || "";
  const onlyFlagged = req.query.flagged === "true";

  const filter = { "chat.0": { $exists: true } }; // only real conversations
  if (req.query.hostId) filter.hostId = req.query.hostId; // track one host's chats
  if (search) {
    filter.$or = [
      { Name: { $regex: search, $options: "i" } },
      { Email: { $regex: search, $options: "i" } },
      { tripName: { $regex: search, $options: "i" } },
    ];
  }

  const all = await Enquire.find(filter).sort({ Date: -1 }).lean();
  const tripIds = [...new Set(all.map((c) => c.tripId).filter(Boolean))];
  const hostIds = [...new Set(all.map((c) => c.hostId).filter(Boolean))];
  const trips = await Trips.find({ _id: { $in: tripIds } }).select("title").lean();
  const hosts = await Host.find({ _id: { $in: hostIds } }).select("hostTitle hostName").lean();
  const tMap = Object.fromEntries(trips.map((t) => [`${t._id}`, t.title]));
  const hMap = Object.fromEntries(hosts.map((h) => [`${h._id}`, h.hostTitle || h.hostName]));

  let rows = all.map((c) => {
    // Canonical "last message" = the newest by timestamp (not array tail, which
    // can be wrong for legacy rows). Preview + lastAt come from that message.
    const ordered = orderChatAsc(c.chat);
    const last = ordered[ordered.length - 1];
    const lastText = last?.deleted ? "(deleted message)" : (last?.Message || "");
    return {
      _id: c._id,
      customerName: c.Name || "—",
      customerEmail: c.Email || "—",
      hostName: hMap[c.hostId] || "—",
      tripName: c.tripName || tMap[c.tripId] || "—",
      lastMessage: lastText.slice(0, 90),
      lastAt: last?.timeStamp || c.Date,
      messageCount: c.chat?.length || 0,
      unread: (c.hostUnread || 0) + (c.userUnread || 0),
      flagged: isFlagged(c),
    };
  });
  if (onlyFlagged) rows = rows.filter((r) => r.flagged);

  // Most recent retained message first, by canonical timestamp, with a stable
  // tie-break on _id so equal timestamps keep a deterministic order.
  rows.sort((a, b) => {
    const diff = new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime();
    return diff || String(b._id).localeCompare(String(a._id));
  });

  const total = rows.length;
  const data = rows.slice((page - 1) * limit, page * limit);
  return res.status(200).json({ success: true, data, total, page, totalPages: Math.ceil(total / limit) });
};

// GET /api/host-chat/admin/conversations/:id — full thread (admin-only).
export const getAdminConversation = async (req, res) => {
  const c = await Enquire.findById(req.params.id).lean();
  if (!c) return res.status(404).json({ error: "Conversation not found" });
  let tripName = c.tripName || "";
  let hostName = "";
  if (!tripName && c.tripId) tripName = (await Trips.findById(c.tripId).select("title").lean())?.title || "";
  if (c.hostId) {
    const h = await Host.findById(c.hostId).select("hostTitle hostName").lean();
    hostName = h?.hostTitle || h?.hostName || "";
  }
  return res.status(200).json({
    success: true,
    data: {
      _id: c._id,
      customer: { name: c.Name || "—", email: c.Email || "—", phone: c.Phone || "—" },
      hostName: hostName || "—",
      tripName: tripName || "—",
      flagged: isFlagged(c),
      moderation: { violations: c.moderation?.violations || 0, pausedUntil: c.moderation?.pausedUntil || null },
      // Admin sees the full audit trail: current text, edited/deleted flags,
      // and immutable version history (host can never erase these).
      messages: orderChatAsc(c.chat).map((m) => ({
        _id: m._id,
        by: m.MessageBy,
        text: m.Message, // admins keep the original even when deleted
        at: m.timeStamp,
        edited: !!m.edited,
        editedAt: m.editedAt || null,
        deleted: !!m.deleted,
        deletedBy: m.deletedBy || null,
        deletedAt: m.deletedAt || null,
        history: (m.history || []).map((h) => ({ text: h.Message, editorRole: h.editorRole, at: h.at, action: h.action })),
      })),
    },
  });
};
