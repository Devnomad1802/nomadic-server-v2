// DB-free self-check for the host media upload file-type classifier.
// Guards the fix for the updateHost 500 incident: iPhone .mov/.heic and
// .avi/.mkv (whose mimetype doesn't echo the extension) must be accepted, while
// genuinely wrong or spoofed types are rejected.
//
// Run: node test_examples/uploadFilter.selfcheck.mjs
import assert from "node:assert/strict";
import { classifyUpload } from "../middlewares/s3Upload.js";

const f = (originalname, mimetype) => ({ originalname, mimetype });
let pass = 0;
const ok = (label, actual, expected) => {
  assert.equal(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  console.log(`  ✓ ${label} → ${expected}`);
  pass++;
};

console.log("classifyUpload — accepted real-world media:");
ok("iPhone video .mov (video/quicktime)", classifyUpload(f("clip.MOV", "video/quicktime")), "video");
ok(".avi (video/x-msvideo)", classifyUpload(f("a.avi", "video/x-msvideo")), "video");
ok(".mkv (video/x-matroska)", classifyUpload(f("a.mkv", "video/x-matroska")), "video");
ok(".mp4 (video/mp4)", classifyUpload(f("a.mp4", "video/mp4")), "video");
ok(".webm (video/webm)", classifyUpload(f("a.webm", "video/webm")), "video");
ok("iPhone photo .heic (image/heic)", classifyUpload(f("IMG_1.HEIC", "image/heic")), "image");
ok(".heif (image/heif)", classifyUpload(f("x.heif", "image/heif")), "image");
ok(".jpg (image/jpeg)", classifyUpload(f("x.jpg", "image/jpeg")), "image");
ok(".jpeg (image/jpeg)", classifyUpload(f("x.jpeg", "image/jpeg")), "image");
ok(".png (image/png)", classifyUpload(f("x.png", "image/png")), "image");
ok(".webp (image/webp)", classifyUpload(f("x.webp", "image/webp")), "image");
ok(".pdf (application/pdf)", classifyUpload(f("x.pdf", "application/pdf")), "doc");
ok(".docx", classifyUpload(f("x.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")), "doc");

console.log("classifyUpload — rejected (null):");
ok(".exe", classifyUpload(f("virus.exe", "application/octet-stream")), null);
ok(".txt", classifyUpload(f("notes.txt", "text/plain")), null);
ok(".svg (XSS vector, not allowed)", classifyUpload(f("x.svg", "image/svg+xml")), null);
ok("spoof: .jpg with octet-stream mime", classifyUpload(f("x.jpg", "application/octet-stream")), null);
ok("spoof: .mp4 ext with image mime", classifyUpload(f("x.mp4", "image/jpeg")), null);
ok("spoof: .pdf ext with video mime", classifyUpload(f("x.pdf", "video/mp4")), null);
ok("no extension", classifyUpload(f("blob", "image/jpeg")), null);
ok("empty file", classifyUpload(f("", "")), null);

console.log(`\nAll ${pass} checks passed.`);
