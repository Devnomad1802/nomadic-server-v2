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

export const serializeChatForParticipant = (chat = []) =>
  (chat || []).map(serializeMessageForParticipant);

// Full enquiry doc → participant-safe JSON (chat sanitized, everything else kept).
export const serializeEnquiryForParticipant = (enquiry) => {
  const o = typeof enquiry.toObject === "function" ? enquiry.toObject() : { ...enquiry };
  o.chat = serializeChatForParticipant(o.chat);
  return o;
};
