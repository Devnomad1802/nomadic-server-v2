/**
 * Instagram Reel URL validation + normalization.
 *
 * Source of truth is the public Instagram URL — we never download, store or
 * proxy the video. Only public reel/post/tv/reels URLs are accepted; anything
 * else (arbitrary hosts, profiles, stories, empty) is rejected. URLs are
 * normalized to a canonical form and de-duplicated so the same reel can't be
 * added twice.
 */
const RE = /^https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)\/?/i;

// One URL → canonical `https://www.instagram.com/<type>/<shortcode>/` or null.
export const normalizeReelUrl = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  const m = raw.trim().match(RE);
  if (!m) return null;
  const type = m[1].toLowerCase() === "reels" ? "reel" : m[1].toLowerCase();
  return `https://www.instagram.com/${type}/${m[2]}/`;
};

export const isValidReelUrl = (raw) => normalizeReelUrl(raw) !== null;

// Array (or JSON string) of URLs → clean, ordered, de-duplicated canonical list.
// Preserves the admin's order; silently drops invalids (validated in the UI too).
export const sanitizeReels = (input) => {
  let list = input;
  if (typeof input === "string") {
    try { list = JSON.parse(input); } catch { list = input ? [input] : []; }
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const url = normalizeReelUrl(typeof item === "string" ? item : item?.url);
    if (url && !seen.has(url)) { seen.add(url); out.push(url); }
  }
  return out;
};
