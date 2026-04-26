import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Directory where files will be stored
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Use timestamp + original file extension as filename
  },
});

// Configure multer with limits for file size
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20SMB limit
});

export const uploadFiles = (fields) => (req, res, next) => {
  // Multer middleware for handling files based on fields
  const uploadMiddleware = upload.fields(fields);

  uploadMiddleware(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: "Multer error: " + error.message });
    } else if (error) {
      return res
        .status(500)
        .json({ error: "Internal server error: " + error.message });
    }
    next();
  });
};
