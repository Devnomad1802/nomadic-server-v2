/**
 * HEIC / HEIF → JPEG conversion (pure-JS, no system binaries).
 *
 * iPhones export photos as HEIC (`image/heic`), which most browsers can't
 * display in the public gallery. We accept the upload and transcode it to a
 * web-safe JPEG in memory before it reaches S3, so hosts can upload straight
 * from a phone without converting first.
 *
 * Uses `heic-convert` (libheif-js WASM) — no libvips/ImageMagick/ffmpeg needed,
 * so it installs and runs on the plain droplet. Fails SOFT: if conversion throws
 * we return the original file rather than losing the upload (the filter already
 * validated it as an allowed image type).
 */
import path from "path";
import heicConvert from "heic-convert";

const isHeic = (file) => {
  const ext = path.extname(file?.originalname || "").toLowerCase();
  const mime = (file?.mimetype || "").toLowerCase();
  return ext === ".heic" || ext === ".heif" || mime === "image/heic" || mime === "image/heif";
};

/**
 * Convert one HEIC/HEIF file buffer → JPEG. Returns the original file object
 * unchanged for non-HEIC input or on any failure.
 * @param {{buffer:Buffer, originalname?:string, mimetype?:string, size?:number}} file
 */
export const maybeConvertHeic = async (file) => {
  if (!file?.buffer || !isHeic(file)) return file;
  try {
    const output = await heicConvert({ buffer: file.buffer, format: "JPEG", quality: 0.9 });
    const jpeg = Buffer.from(output);
    const base = path.parse(file.originalname || "image").name;
    return {
      ...file,
      buffer: jpeg,
      mimetype: "image/jpeg",
      originalname: `${base}.jpg`,
      size: jpeg.length,
    };
  } catch (e) {
    console.error("HEIC→JPEG conversion failed, using original:", e?.message || e);
    return file;
  }
};

export default { maybeConvertHeic };
