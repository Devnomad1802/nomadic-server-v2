// Detects attempts to share direct/off-platform contact info in chat messages.
// Used to keep host <-> traveller conversations platform-mediated.
const PATTERNS = [
  // phone numbers: 7+ digits, optionally grouped/spaced/dashed, with +cc
  /(?:\+?\d[\s().-]?){7,}\d/,
  // emails
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  // messaging apps / handles / links
  /\b(whats\s*app|wa\.me|telegram|t\.me|signal|snapchat|insta(gram)?|@[a-z0-9._]{3,})\b/i,
  /\b(https?:\/\/|www\.)\S+/i,
  // "call/text/dm me on/at ..." intent
  /\b(call|text|whatsapp|dm|message|reach|contact)\s+me\s+(on|at|via)\b/i,
];

export function containsContactInfo(text) {
  if (!text) return false;
  const s = String(text);
  return PATTERNS.some((re) => re.test(s));
}

export const CONTACT_WARNING =
  "Direct contact sharing is not allowed. Please continue the conversation safely through Nomadic Townies.";
