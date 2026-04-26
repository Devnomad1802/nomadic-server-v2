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

// Configure multer for memory storage (we'll upload directly to S3)
const storage = multer.memoryStorage();

// Regular upload for small files
const upload = multer({
  storage,
  limits: {
    fileSize: S3_CONFIG.MAX_FILE_SIZE,
    fieldSize: 200 * 1024 * 1024 // 200MB for field data (text fields like overview, Inclusion, etc.)
  },
  fileFilter: (req, file, cb) => {
    // Use configuration for file type validation
    const extname = S3_CONFIG.ALLOWED_FILE_TYPES.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = S3_CONFIG.ALLOWED_FILE_TYPES.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, PDF, DOC, DOCX files are allowed."
        )
      );
    }
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
    const extname = path.extname(file.originalname).toLowerCase();
    const mimetype = file.mimetype;

    // Check for image files
    const isImage = S3_CONFIG.ALLOWED_FILE_TYPES.test(extname) &&
      S3_CONFIG.ALLOWED_FILE_TYPES.test(mimetype);

    // Check for video files
    const isVideo = S3_CONFIG.ALLOWED_VIDEO_TYPES.test(extname) &&
      S3_CONFIG.ALLOWED_VIDEO_TYPES.test(mimetype);

    if (isImage || isVideo) {
      return cb(null, true);
    } else {
      cb(new Error(
        "Invalid file type. Only JPEG, PNG, PDF, DOC, DOCX, MP4, AVI, MOV, WMV, FLV, WEBM, MKV, M4V files are allowed."
      ));
    }
  },
});

// Generate unique filename
const generateFileName = (originalName) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(6).toString("hex");
  const extension = path.extname(originalName);
  return `${timestamp}-${randomString}${extension}`;
};

// Check if file is a video
const isVideoFile = (file) => {
  const extname = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;
  return S3_CONFIG.ALLOWED_VIDEO_TYPES.test(extname) &&
    S3_CONFIG.ALLOWED_VIDEO_TYPES.test(mimetype);
};

// Upload single file to S3 (regular upload for small files)
export const uploadToS3 = async (file, folder = "documents") => {
  try {
    const fileName = generateFileName(file.originalname);
    const key = `${folder}/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: aws_config.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ACL removed - bucket has ACLs disabled
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
      // ACL removed - bucket has ACLs disabled
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
      if (error instanceof multer.MulterError) {
        return res
          .status(400)
          .json({ error: "Multer error: " + error.message });
      } else if (error) {
        return res
          .status(500)
          .json({ error: "File upload error: " + error.message });
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
        return res.status(500).json({ error: "Failed to upload files to S3" });
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

// Legacy function for backward compatibility with coverImages
export const uploadCoverImagesToS3 = (fields) => {
  return async (req, res, next) => {
    // Use multer to parse files first - allow any field for dynamic array handling
    const uploadMiddleware = uploadAdvanced.any();

    uploadMiddleware(req, res, async (error) => {
      if (error instanceof multer.MulterError) {
        return res
          .status(400)
          .json({ error: "Multer error: " + error.message });
      } else if (error) {
        return res
          .status(500)
          .json({ error: "File upload error: " + error.message });
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
        return res.status(500).json({ error: "Failed to upload files to S3" });
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
