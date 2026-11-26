import {
  PutObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} from "@aws-sdk/client-s3";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { s3Client, aws_config, S3_CONFIG, generateS3Url, extractS3Key } from "../config/aws.config.js";
import { compressReelVideo } from "../utils/compressVideo.js";
import { maybeConvertHeic } from "../utils/convertHeic.js";
import { ValidationError } from "./throwErrors.js";

// Configure multer for memory storage (we'll upload directly to S3)
const storage = multer.memoryStorage();

// ── File-type classification (shared by the upload filter and the video router) ──
// Classify by EXTENSION, then confirm the MIME *family* agrees. The previous
// filter required the mimetype string to literally contain the extension token,
// which wrongly rejected real formats whose mimetype doesn't echo the extension:
//   .mov → video/quicktime, .avi → video/x-msvideo, .mkv → video/x-matroska,
//   .heic → image/heic. None contain their extension, so every such upload
// (e.g. an iPhone reel or photo) was rejected and surfaced as a 500.
// Matching on the MIME family (image/ | video/) accepts them while still
// blocking a file whose extension and content family disagree (anti-spoofing).
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const VIDEO_EXT = /\.(mp4|mov|avi|wmv|flv|webm|mkv|m4v)$/i;
const DOC_EXT = /\.(pdf|docx?)$/i;
const DOC_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const extOf = (file) => path.extname(file?.originalname || "").toLowerCase();
const UNSUPPORTED_FILE_MSG =
  "Unsupported file type. Please upload a JPG, PNG, HEIC, PDF, MP4 or MOV file.";
const IMAGE_DOC_ONLY_MSG =
  "Unsupported file type. Please upload a JPG, PNG, HEIC or PDF file.";

// Returns "image" | "video" | "doc" | null. Exported for unit testing.
export const classifyUpload = (file) => {
  const ext = extOf(file);
  const mime = (file?.mimetype || "").toLowerCase();
  if (IMAGE_EXT.test(ext) && mime.startsWith("image/")) return "image";
  if (VIDEO_EXT.test(ext) && mime.startsWith("video/")) return "video";
  if (DOC_EXT.test(ext) && DOC_MIMES.has(mime)) return "doc";
  return null;
};

// Regular upload for small files
const upload = multer({
  storage,
  limits: {
    fileSize: S3_CONFIG.MAX_FILE_SIZE,
    fieldSize: 200 * 1024 * 1024 // 200MB for field data (text fields like overview, Inclusion, etc.)
  },
  fileFilter: (req, file, cb) => {
    // Images (incl. HEIC/HEIF, converted to JPEG after upload) and documents.
    // This path is for small files only; videos belong on the reel path
    // (uploadAdvanced). Rejections are a field-level 400, not a 500.
    const kind = classifyUpload(file);
    if (kind === "image" || kind === "doc") return cb(null, true);
    return cb(
      new ValidationError(
        { [file.fieldname || "file"]: IMAGE_DOC_ONLY_MSG },
        IMAGE_DOC_ONLY_MSG
      )
    );
  },
});

// Advanced upload for large files and videos
const uploadAdvanced = multer({
  storage,
  limits: {
    fileSize: S3_CONFIG.MAX_VIDEO_SIZE, // Allow up to 500MB for videos
    fieldSize: 200 * 1024 * 1024 // 200MB for field data (text fields)
  },
  fileFilter: (req, file, cb) => {
    // Accept images (incl. HEIC/HEIF — converted to JPEG after upload), videos
    // and docs by extension + MIME family. Reject everything else as a
    // field-level 400 (ValidationError) so the admin sees an actionable message
    // instead of a generic 500.
    if (classifyUpload(file)) return cb(null, true);
    return cb(
      new ValidationError(
        { [file.fieldname || "file"]: UNSUPPORTED_FILE_MSG },
        UNSUPPORTED_FILE_MSG
      )
    );
  },
});

// Generate unique filename
const generateFileName = (originalName) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(6).toString("hex");
  const extension = path.extname(originalName);
  return `${timestamp}-${randomString}${extension}`;
};

// Check if file is a video (routes to transcode + multipart upload). Uses the
// shared classifier so .mov/.avi/.mkv (whose mimetype doesn't echo the
// extension) are correctly treated as video, not misrouted as an image.
const isVideoFile = (file) => classifyUpload(file) === "video";

// Upload single file to S3 (regular upload for small files). Every image upload
// path funnels through here, so HEIC/HEIF → JPEG conversion lives here (no-op
// for non-HEIC input), giving the public gallery web-displayable images.
export const uploadToS3 = async (file, folder = "documents") => {
  try {
    file = await maybeConvertHeic(file);
    const fileName = generateFileName(file.originalname);
    const key = `${folder}/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: aws_config.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: "public-read",
    });

    await s3Client.send(command);

    // Return the public URL using helper function
    const fileUrl = generateS3Url(key);
    return {
      url: fileUrl,
      key: key,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      uploadType: 'single'
    };
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw new Error("Failed to upload file to S3");
  }
};

// Multipart upload for large files (>50MB)
export const uploadLargeFileToS3 = async (file, folder = "documents") => {
  try {
    const fileName = generateFileName(file.originalname);
    const key = `${folder}/${fileName}`;

    // Create multipart upload
    const createCommand = new CreateMultipartUploadCommand({
      Bucket: aws_config.bucketName,
      Key: key,
      ContentType: file.mimetype,
      ACL: "public-read",
    });

    const { UploadId } = await s3Client.send(createCommand);

    const parts = [];
    const chunkSize = S3_CONFIG.MULTIPART_CHUNK_SIZE;
    const totalChunks = Math.ceil(file.buffer.length / chunkSize);

    console.log(`Starting multipart upload for ${file.originalname}: ${totalChunks} parts`);

    // Upload each part
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.buffer.length);
      const chunk = file.buffer.slice(start, end);

      const uploadPartCommand = new UploadPartCommand({
        Bucket: aws_config.bucketName,
        Key: key,
        PartNumber: i + 1,
        UploadId: UploadId,
        Body: chunk,
      });

      const { ETag } = await s3Client.send(uploadPartCommand);
      parts.push({
        ETag,
        PartNumber: i + 1,
      });

      console.log(`Uploaded part ${i + 1}/${totalChunks} for ${file.originalname}`);
    }

    // Complete multipart upload
    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: aws_config.bucketName,
      Key: key,
      UploadId: UploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });

    await s3Client.send(completeCommand);

    const fileUrl = generateS3Url(key);
    console.log(`Multipart upload completed for ${file.originalname}`);

    return {
      url: fileUrl,
      key: key,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      uploadType: 'multipart',
      parts: parts.length
    };
  } catch (error) {
    console.error("Error in multipart upload:", error);

    // Attempt to abort multipart upload on error
    try {
      const abortCommand = new AbortMultipartUploadCommand({
        Bucket: aws_config.bucketName,
        Key: key,
        UploadId: UploadId,
      });
      await s3Client.send(abortCommand);
      console.log("Aborted multipart upload due to error");
    } catch (abortError) {
      console.error("Error aborting multipart upload:", abortError);
    }

    throw new Error("Failed to upload large file to S3");
  }
};

// Smart upload function that chooses between single and multipart upload
export const smartUploadToS3 = async (file, folder = "documents") => {
  const isVideo = isVideoFile(file);
  const isLargeFile = file.size > S3_CONFIG.MULTIPART_THRESHOLD;

  if (isVideo && isLargeFile) {
    console.log(`Using multipart upload for large video: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    return await uploadLargeFileToS3(file, folder);
  } else {
    console.log(`Using single upload for file: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    return await uploadToS3(file, folder);
  }
};

// Delete file from S3
export const deleteFromS3 = async (fileKey) => {
  try {
    if (!fileKey) return;

    // Extract key from URL if full URL is provided
    let key = fileKey;
    if (fileKey.includes("amazonaws.com/")) {
      key = fileKey.split("amazonaws.com/")[1];
    }

    const command = new DeleteObjectCommand({
      Bucket: aws_config.bucketName,
      Key: key,
    });

    await s3Client.send(command);
    console.log(`File deleted from S3: ${key}`);
  } catch (error) {
    console.error("Error deleting from S3:", error);
    // Don't throw error here to prevent blocking other operations
  }
};

// Delete multiple files from S3
export const deleteMultipleFromS3 = async (fileKeys) => {
  try {
    const deletePromises = fileKeys.map((key) => deleteFromS3(key));
    await Promise.all(deletePromises);
  } catch (error) {
    console.error("Error deleting multiple files from S3:", error);
  }
};

// Middleware for handling multiple file uploads with S3
export const uploadFilesToS3 = (fields) => {
  return async (req, res, next) => {
    // Use multer to parse files first
    const uploadMiddleware = upload.fields(fields);

    uploadMiddleware(req, res, async (error) => {
      if (error) {
        // Unsupported-type / size / count problems are the user's to fix → 400.
        // Only a genuine fault is a 500. Shape matches the central error handler.
        const status = error.status || (error instanceof multer.MulterError ? 400 : 500);
        return res.status(status).json({
          success: false,
          message: error.message || "Upload problem — please try again.",
          error: {
            type: error.type || (status === 400 ? "UPLOAD_ERROR" : "SERVER_ERROR"),
            message: error.message,
            fields: error.fields || {},
          },
        });
      }

      try {
        // Upload files to S3
        if (req.files) {
          const uploadPromises = [];
          const uploadedFiles = {};

          // Process each field
          for (const fieldName in req.files) {
            const files = req.files[fieldName];
            uploadedFiles[fieldName] = [];

            for (const file of files) {
              // Use specific folder for each document type
              uploadPromises.push(
                uploadToS3(file).then((result) => ({
                  fieldName,
                  result,
                }))
              );
            }
          }

          // Wait for all uploads to complete
          const results = await Promise.all(uploadPromises);

          // Organize results by field name
          results.forEach(({ fieldName, result }) => {
            uploadedFiles[fieldName].push(result);
          });

          // Add uploaded file info to request
          req.uploadedFiles = uploadedFiles;
        }

        next();
      } catch (uploadError) {
        console.error("S3 upload error:", uploadError);
        return res.status(500).json({
          error: "Failed to upload files to S3",
          detail: uploadError?.message || String(uploadError),
          code: uploadError?.Code || uploadError?.code || uploadError?.name,
        });
      }
    });
  };
};

// Advanced middleware for handling banner uploads with new payload structure
export const uploadBannerFilesToS3 = () => {
  return async (req, res, next) => {
    // Use multer to parse files - allow any field for dynamic handling
    const uploadMiddleware = uploadAdvanced.any();

    uploadMiddleware(req, res, async (error) => {
      if (error instanceof multer.MulterError) {
        return res.status(400).json({
          error: "Multer error: " + error.message,
          code: error.code
        });
      } else if (error) {
        return res.status(500).json({
          error: "File upload error: " + error.message
        });
      }

      try {
        // Upload files to S3
        if (req.files && req.files.length > 0) {
          const uploadPromises = [];
          const uploadedFiles = {};
          const uploadErrors = [];

          // Process each file
          for (const file of req.files) {
            uploadPromises.push(
              smartUploadToS3(file, "banners").then((result) => ({
                fieldName: file.fieldname,
                result,
              })).catch((error) => {
                uploadErrors.push({
                  fieldName: file.fieldname,
                  fileName: file.originalname,
                  error: error.message
                });
                return null;
              })
            );
          }

          // Wait for all uploads to complete
          const results = await Promise.all(uploadPromises);

          // Check if any uploads failed
          if (uploadErrors.length > 0) {
            // Clean up successful uploads
            const successfulUploads = results.filter(r => r !== null);
            const filesToDelete = [];

            successfulUploads.forEach(({ result }) => {
              filesToDelete.push(result.key);
            });

            if (filesToDelete.length > 0) {
              await deleteMultipleFromS3(filesToDelete);
            }

            return res.status(500).json({
              error: "Some files failed to upload",
              failedUploads: uploadErrors
            });
          }

          // Organize results by field name
          results.forEach(({ fieldName, result }) => {
            if (!uploadedFiles[fieldName]) {
              uploadedFiles[fieldName] = [];
            }
            uploadedFiles[fieldName].push(result);
          });

          // Add uploaded file info to request
          req.uploadedFiles = uploadedFiles;
        }

        next();
      } catch (uploadError) {
        console.error("S3 upload error:", uploadError);

        // Clean up any uploaded files on error
        if (req.uploadedFiles) {
          const filesToDelete = [];
          Object.values(req.uploadedFiles).flat().forEach(file => {
            filesToDelete.push(file.key);
          });
          await deleteMultipleFromS3(filesToDelete);
        }

        return res.status(500).json({
          error: "Failed to upload files to S3",
          details: uploadError.message
        });
      }
    });
  };
};

// Advanced middleware for handling blog uploads with dynamic field names
export const uploadBlogFilesToS3 = () => {
  return async (req, res, next) => {
    // Use multer to parse files - allow any field for dynamic handling
    const uploadMiddleware = uploadAdvanced.any();

    uploadMiddleware(req, res, async (error) => {
      if (error instanceof multer.MulterError) {
        return res.status(400).json({
          error: "Multer error: " + error.message,
          code: error.code
        });
      } else if (error) {
        return res.status(500).json({
          error: "File upload error: " + error.message
        });
      }

      try {
        // Upload files to S3
        if (req.files && req.files.length > 0) {
          const uploadPromises = [];
          const uploadedFiles = {};
          const uploadErrors = [];

          // Process each file
          for (const file of req.files) {
            uploadPromises.push(
              smartUploadToS3(file, "blogs").then((result) => ({
                fieldName: file.fieldname,
                result,
              })).catch((error) => {
                uploadErrors.push({
                  fieldName: file.fieldname,
                  fileName: file.originalname,
                  error: error.message
                });
                return null;
              })
            );
          }

          // Wait for all uploads to complete
          const results = await Promise.all(uploadPromises);

          // Check if any uploads failed
          if (uploadErrors.length > 0) {
            // Clean up successful uploads
            const successfulUploads = results.filter(r => r !== null);
            const filesToDelete = [];

            successfulUploads.forEach(({ result }) => {
              filesToDelete.push(result.key);
            });

            if (filesToDelete.length > 0) {
              await deleteMultipleFromS3(filesToDelete);
            }

            return res.status(500).json({
              error: "Some files failed to upload",
              failedUploads: uploadErrors
            });
          }

          // Organize results by field name
          results.forEach(({ fieldName, result }) => {
            if (!uploadedFiles[fieldName]) {
              uploadedFiles[fieldName] = [];
            }
            uploadedFiles[fieldName].push(result);
          });

          // Add uploaded file info to request
          req.uploadedFiles = uploadedFiles;
        }

        next();
      } catch (uploadError) {
        console.error("S3 upload error:", uploadError);

        // Clean up any uploaded files on error
        if (req.uploadedFiles) {
          const filesToDelete = [];
          Object.values(req.uploadedFiles).flat().forEach(file => {
            filesToDelete.push(file.key);
          });
          await deleteMultipleFromS3(filesToDelete);
        }

        return res.status(500).json({
          error: "Failed to upload files to S3",
          details: uploadError.message
        });
      }
    });
  };
};

// Host media uploads — same fixed-field shape as uploadFilesToS3, but backed by
// the advanced (video-capable) multer so reel videos (mp4/mov/webm…) are
// accepted. Videos land in "host-reels", everything else in "hosts". Large
// videos go through multipart automatically (smartUploadToS3).
export const uploadHostFilesToS3 = (fields) => {
  return async (req, res, next) => {
    const uploadMiddleware = uploadAdvanced.fields(fields);

    uploadMiddleware(req, res, async (error) => {
      // Forward upload errors to the central error handler so they become
      // friendly, field-level messages (Multer code + field are preserved).
      if (error) return next(error);

      try {
        if (req.files) {
          const uploadPromises = [];
          const uploadedFiles = {};

          for (const fieldName in req.files) {
            uploadedFiles[fieldName] = [];
            for (const file of req.files[fieldName]) {
              if (isVideoFile(file)) {
                // Compress reel videos before storing (transcode → smaller mp4).
                uploadPromises.push(
                  compressReelVideo(file)
                    .then((out) => smartUploadToS3(out, "host-reels"))
                    .then((result) => ({ fieldName, result }))
                );
              } else {
                // Images (incl. HEIC → JPEG) are converted inside uploadToS3.
                uploadPromises.push(
                  smartUploadToS3(file, "hosts").then((result) => ({ fieldName, result }))
                );
              }
            }
          }

          const results = await Promise.all(uploadPromises);
          results.forEach(({ fieldName, result }) => {
            uploadedFiles[fieldName].push(result);
          });
          req.uploadedFiles = uploadedFiles;
        }
        next();
      } catch (uploadError) {
        console.error("S3 host upload error:", uploadError);
        return res.status(500).json({
          error: "Failed to upload files to S3",
          detail: uploadError?.message || String(uploadError),
        });
      }
    });
  };
};

// Legacy function for backward compatibility with coverImages
export const uploadCoverImagesToS3 = (fields) => {
  return async (req, res, next) => {
    // Use multer to parse files first - allow any field for dynamic array handling
    const uploadMiddleware = uploadAdvanced.any();

    uploadMiddleware(req, res, async (error) => {
      if (error) {
        // Unsupported-type / size / count problems are the user's to fix → 400.
        // Only a genuine fault is a 500. Shape matches the central error handler.
        const status = error.status || (error instanceof multer.MulterError ? 400 : 500);
        return res.status(status).json({
          success: false,
          message: error.message || "Upload problem — please try again.",
          error: {
            type: error.type || (status === 400 ? "UPLOAD_ERROR" : "SERVER_ERROR"),
            message: error.message,
            fields: error.fields || {},
          },
        });
      }

      try {
        // Upload files to S3
        if (req.files && req.files.length > 0) {
          const uploadPromises = [];
          const uploadedFiles = {};

          // Process each file
          for (const file of req.files) {
            uploadPromises.push(
              smartUploadToS3(file, "cover-images").then((result) => ({
                fieldName: file.fieldname,
                result,
              }))
            );
          }

          // Wait for all uploads to complete
          const results = await Promise.all(uploadPromises);

          // Organize results by field name
          results.forEach(({ fieldName, result }) => {
            if (!uploadedFiles[fieldName]) {
              uploadedFiles[fieldName] = [];
            }
            uploadedFiles[fieldName].push(result);
          });

          // Add uploaded file info to request
          req.uploadedFiles = uploadedFiles;
        }

        next();
      } catch (uploadError) {
        console.error("S3 upload error:", uploadError);
        return res.status(500).json({
          error: "Failed to upload files to S3",
          detail: uploadError?.message || String(uploadError),
          code: uploadError?.Code || uploadError?.code || uploadError?.name,
        });
      }
    });
  };
};

export default {
  uploadToS3,
  uploadLargeFileToS3,
  smartUploadToS3,
  deleteFromS3,
  deleteMultipleFromS3,
  uploadFilesToS3,
  uploadBannerFilesToS3,
  uploadBlogFilesToS3,
  uploadCoverImagesToS3,
};
