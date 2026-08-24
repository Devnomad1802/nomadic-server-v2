/**
 * Host reels — video metadata sanitizer.
 *
 * Reels are short 9:16 videos the host owns, uploaded by the admin and served
 * from our own S3/CDN (the gallery autoplays them natively). Each reel is an
 * object { videoUrl, poster?, sourceUrl? }. We never scrape or download from
 * Instagram — the mp4 is uploaded directly.
 *
 * The admin sends `reels` as a JSON array where each item is either:
 *   - an existing reel: { videoUrl: "<s3 url>", poster?: "<s3 url>", sourceUrl? }
 *   - a new reel:       { videoIndex: <i>, posterIndex?: <j>, sourceUrl? }
 * where videoIndex/posterIndex point into the freshly-uploaded file arrays
 * (req.uploadedFiles.reelVideos / reelPosters, in submit order).
 */

// Only keep an Instagram URL if it's a real public reel/post link; otherwise
// drop it (sourceUrl is admin-only reference data, never shown to users).
const IG_RE = /^https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:reel|reels|p|tv)\/[A-Za-z0-9_-]+/i;
const cleanSource = (raw) =>
  typeof raw === "string" && IG_RE.test(raw.trim()) ? raw.trim() : undefined;

/**
 * Build the stored reels array from the admin payload.
 * @param {any} input           `reels` (JSON string or array of items)
 * @param {string[]} videoUrls  uploaded reel video S3 urls (submit order)
 * @param {string[]} posterUrls uploaded reel poster S3 urls (submit order)
 * @returns {{videoUrl:string,poster?:string,sourceUrl?:string}[]}
 */
export const sanitizeReels = (input, videoUrls = [], posterUrls = []) => {
  let list = input;
  if (typeof input === "string") {
    try { list = JSON.parse(input); } catch { list = []; }
  }
  if (!Array.isArray(list)) return [];

  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;

    const videoUrl =
      typeof item.videoUrl === "string" && item.videoUrl
        ? item.videoUrl
        : Number.isInteger(item.videoIndex)
        ? videoUrls[item.videoIndex]
        : undefined;
    if (!videoUrl || seen.has(videoUrl)) continue; // a reel needs a video; no dupes
    seen.add(videoUrl);

    const poster =
      typeof item.poster === "string" && item.poster
        ? item.poster
        : Number.isInteger(item.posterIndex)
        ? posterUrls[item.posterIndex]
        : undefined;

    const reel = { videoUrl };
    if (poster) reel.poster = poster;
    const src = cleanSource(item.sourceUrl);
    if (src) reel.sourceUrl = src;
    out.push(reel);
  }
  return out;
};

// S3 urls no longer referenced by the new reels list — for cleanup on update.
export const reelAssetUrls = (reels = []) => {
  const urls = [];
  for (const r of reels) {
    if (r?.videoUrl) urls.push(r.videoUrl);
    if (r?.poster) urls.push(r.poster);
  }
  return urls;
};
