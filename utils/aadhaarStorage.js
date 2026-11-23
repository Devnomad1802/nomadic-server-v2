// Aadhaar storage helpers — PRIVATE document handling, kept free of any DB or
// network so the risky bits (file-signature validation, side-merge) are unit
// testable without Mongo or S3.
//
// Why private: Aadhaar is government identity data. Every other host document
// is stored public-read on DO Spaces; Aadhaar must NOT be. We store only the
// object key and stream the bytes back through an authenticated proxy.

// Private object prefix (never served as a public URL).
export const AADHAAR_FOLDER = "host-documents-private/aadhaar";

// The two valid sides of the one logical Aadhaar document.
export const AADHAAR_SIDES = ["front", "back"];

// Map a side ("front"/"back") to its schema field on host.documents.
export const sideField = (side) =>
  side === "front" ? "aadhaarFront" : side === "back" ? "aadhaarBack" : null;

// Only real images, verified by magic bytes — NOT by extension or the
// client-supplied mimetype (both trivially spoofable). Returns the canonical
// mime string, or null if the buffer is not an allowed image.
// JPEG:  FF D8 FF
// PNG:   89 50 4E 47 0D 0A 1A 0A
// WebP:  "RIFF" .... "WEBP"
export function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf[0] === 0x52 && // R
    buf[1] === 0x49 && // I
    buf[2] === 0x46 && // F
    buf[3] === 0x46 && // F
    buf[8] === 0x57 && // W
    buf[9] === 0x45 && // E
    buf[10] === 0x42 && // B
    buf[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

// Merge newly-uploaded Aadhaar sides onto the existing documents subdoc,
// preserving the untouched side. `uploaded` is a partial map of
// { aadhaarFront?: key, aadhaarBack?: key } — only present keys overwrite.
// Returns { documents, replacedKeys } where replacedKeys are old keys that a
// new upload superseded (caller deletes them from storage).
export function mergeAadhaarDocs(existingDocs, uploaded) {
  const documents = { ...(existingDocs || {}) };
  const replacedKeys = [];
  for (const field of ["aadhaarFront", "aadhaarBack"]) {
    const next = uploaded?.[field];
    if (!next) continue; // side not part of this upload → keep what's stored
    if (documents[field] && documents[field] !== next) {
      replacedKeys.push(documents[field]);
    }
    documents[field] = next;
  }
  return { documents, replacedKeys };
}

// Max Aadhaar image size (bytes). Smaller than the generic 20MB doc cap — an
// ID photo has no reason to be large, and a tight cap shrinks abuse surface.
export const AADHAAR_MAX_BYTES = 8 * 1024 * 1024;
