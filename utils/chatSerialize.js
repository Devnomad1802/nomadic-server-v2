// ─────────────────────────────────────────────────────────────
// Canonical plain-text message rules + participant-safe serialization.
//
// Storage keeps the full audit trail (edits, soft-deleted originals,
// version history). Participants (host dashboard + customer app) must
// NEVER receive deleted content or history — only a neutral placeholder.
// Admin APIs serialize separately and keep everything.
// ─────────────────────────────────────────────────────────────

export const MAX_MESSAGE_LEN = 5000;
export const DELETED_PLACEHOLDER = "This message was deleted";

// Returns a trimmed message or an error string (never silently truncates).
export const validateMessage = (raw) => {
  const text = String(raw ?? "").replace(/\r\n/g, "\n"); // normalize newlines
  const trimmed = text.replace(/\s+$/g, "").replace(/^\n+/, ""); // keep inner spacing
  if (!trimmed.trim()) return { error: "Message is required." };
  if (trimmed.length > MAX_MESSAGE_LEN) {
    return { error: `Message is too long (max ${MAX_MESSAGE_LEN} characters).` };
  }
  return { text: trimmed };
};

// One chat subdoc → participant-safe shape (no history, deleted → placeholder).
export const serializeMessageForParticipant = (m) => {
  const o = typeof m.toObject === "function" ? m.toObject() : m;
  return {
    _id: o._id,
    MessageBy: o.MessageBy,
    Message: o.deleted ? DELETED_PLACEHOLDER : o.Message,
    timeStamp: o.timeStamp,
    edited: !!o.edited,
    editedAt: o.edited ? o.editedAt : null,
    deleted: !!o.deleted,
  };
};

// Oldest → newest by timeStamp, with a STABLE tie-break on original (insertion)
// order so equal or missing timestamps never reshuffle. Pure; does not mutate
// the input array. Reinforces chronology at the API boundary regardless of how
// the client renders.
export const orderChatAsc = (chat = []) =>
  (chat || [])
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ta = new Date(a.m?.timeStamp ?? NaN).getTime();
      const tb = new Date(b.m?.timeStamp ?? NaN).getTime();
      const aBad = isNaN(ta);
      const bBad = isNaN(tb);
      if (aBad || bBad) return a.i - b.i; // undated → keep insertion order
      return ta - tb || a.i - b.i;
    })
    .map((x) => x.m);

export const serializeChatForParticipant = (chat = []) =>
  orderChatAsc(chat).map(serializeMessageForParticipant);

// Full enquiry doc → participant-safe JSON. Chat is sanitized AND the
// customer's contact PII (Email, Phone, userId, dedupeKey) is dropped — the
// host never receives it. Platform policy: parties communicate only in-app.
const HOST_SAFE_FIELDS = [
  "_id", "Name", "Message", "status", "tripId", "tripName",
  "source", "batchInfo", "partySize", "Date", "hostUnread", "userUnread",
];
export const serializeEnquiryForParticipant = (enquiry) => {
  const o = typeof enquiry.toObject === "function" ? enquiry.toObject() : { ...enquiry };
  const safe = {};
  for (const k of HOST_SAFE_FIELDS) if (o[k] !== undefined) safe[k] = o[k];
  // Moderation state the UI needs (pause banner) — no PII.
  safe.moderation = {
    violations: o.moderation?.violations || 0,
    pausedUntil: o.moderation?.pausedUntil || null,
  };
  safe.chat = serializeChatForParticipant(o.chat);
  return safe;
};
