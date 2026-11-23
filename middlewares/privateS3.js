// Private S3/Spaces helpers for sensitive documents (Aadhaar).
//
// Separate from middlewares/s3Upload.js on purpose: that module hard-codes
// ACL "public-read" for every object. These objects are uploaded ACL "private"
// and are NEVER exposed as a public URL — the bytes are streamed back only
// through an authenticated route (getPrivateObjectStream → res.pipe).
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import multer from "multer";
import crypto from "crypto";
import { s3Client, aws_config } from "../config/aws.config.js";
import { AADHAAR_FOLDER, AADHAAR_MAX_BYTES } from "../utils/aadhaarStorage.js";

// Memory multer for the paired Aadhaar upload. Both sides optional per request
// so either can be replaced independently. Real image validation happens AFTER
// this (magic-byte sniff in the controller) — multer only buffers.
export const aadhaarMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AADHAAR_MAX_BYTES },
}).fields([
  { name: "aadhaarFront", maxCount: 1 },
  { name: "aadhaarBack", maxCount: 1 },
]);

const randomName = (ext) =>
  `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;

const extForMime = (mime) =>
  mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";

// Upload a validated image buffer with PRIVATE ACL. `mime` must already be the
// sniffed, trusted mime (see utils/aadhaarStorage.sniffImageType). Returns the
// stored object key (what we persist on host.documents.aadhaar*).
export async function uploadPrivateToS3(buffer, mime, folder = AADHAAR_FOLDER) {
  const key = `${folder}/${randomName(extForMime(mime))}`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: aws_config.bucketName,
      Key: key,
      Body: buffer,
      ContentType: mime,
      ACL: "private",
    })
  );
  return key;
}

// Fetch a private object for streaming back to an authorized caller.
// Returns { body, contentType, contentLength } where body is a Node stream.
export async function getPrivateObjectStream(key) {
  const out = await s3Client.send(
    new GetObjectCommand({ Bucket: aws_config.bucketName, Key: key })
  );
  return {
    body: out.Body,
    contentType: out.ContentType || "application/octet-stream",
    contentLength: out.ContentLength,
  };
}

// Delete a private object by its stored key (not URL). Never throws — a failed
// cleanup of a superseded file must not break the request.
export async function deletePrivateFromS3(key) {
  if (!key) return;
  try {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: aws_config.bucketName, Key: key })
    );
  } catch (e) {
    console.error("deletePrivateFromS3 failed:", e?.message);
  }
}
