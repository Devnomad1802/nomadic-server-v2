/**
 * Reel video compression (server-side, ffmpeg).
 *
 * Host reels are short vertical clips. Before storing on S3 we transcode them
 * to a web-friendly H.264 MP4: capped to 1080px on the long side, CRF 28,
 * yuv420p, +faststart (so the browser can start playing before full download),
 * AAC 128k audio, 30fps. This keeps CDN storage/bandwidth low while the gallery
 * autoplays them natively.
 *
 * ffmpeg runs on file paths (faststart needs a seekable output), so we spill the
 * in-memory upload to a temp file, transcode, read the result back, and clean
 * up. Fails soft: if anything goes wrong we return the original buffer so an
 * upload is never lost to a transcode error.
 */
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import ffmpegPath from "ffmpeg-static";

const MAX_LONG_EDGE = 1080;

// Only downscale when larger than the cap; never upscale. Keeps aspect, forces
// even dimensions (yuv420p requirement).
const SCALE = `scale='if(gt(iw,ih),min(${MAX_LONG_EDGE},iw),-2)':'if(gt(iw,ih),-2,min(${MAX_LONG_EDGE},ih))':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;

const run = (args) =>
  new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    ff.stderr.on("data", (d) => { stderr += d.toString().slice(-2000); });
    ff.on("error", reject);
    ff.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`))
    );
  });

/**
 * Compress one video buffer → { buffer, mimetype, originalname } (mp4).
 * Returns the ORIGINAL file object on any failure.
 */
export const compressReelVideo = async (file) => {
  if (!ffmpegPath) return file; // binary missing — skip, don't break uploads
  const id = crypto.randomBytes(8).toString("hex");
  const inPath = path.join(os.tmpdir(), `reel-in-${id}`);
  const outPath = path.join(os.tmpdir(), `reel-out-${id}.mp4`);
  try {
    await fs.writeFile(inPath, file.buffer);
    await run([
      "-y",
      "-i", inPath,
      "-vf", SCALE,
      "-r", "30",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "28",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "128k",
      "-map_metadata", "-1", // strip source metadata
      outPath,
    ]);
    const buffer = await fs.readFile(outPath);
    // If the transcode somehow got bigger, keep the smaller original.
    if (buffer.length >= file.buffer.length) return file;
    const base = path.parse(file.originalname || "reel").name;
    return { ...file, buffer, mimetype: "video/mp4", originalname: `${base}.mp4`, size: buffer.length };
  } catch (e) {
    console.error("reel compression failed, using original:", e?.message || e);
    return file;
  } finally {
    fs.unlink(inPath).catch(() => {});
    fs.unlink(outPath).catch(() => {});
  }
};
