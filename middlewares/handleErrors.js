// Human-readable messages for common low-level errors, keyed by nothing the
// admin should ever see raw (MongoError, MulterError, CastError, …).
const FRIENDLY = {
  LIMIT_FILE_SIZE: "This file is too large. Please upload a smaller file.",
  LIMIT_FILE_COUNT: "Too many files. Please remove some and try again.",
  LIMIT_UNEXPECTED_FILE: "Upload problem — a file was sent in an unexpected field. Please re-select the file and try again.",
};

// Translate an Express/Mongoose/Multer error into a consistent, admin-friendly
// shape: { success:false, message, error:{ type, message, fields } }. `message`
// is kept at the top level too for older clients that read err.data.message.
const normalize = (err) => {
  // Our own structured validation error (per-field messages).
  if (err?.type === "VALIDATION_ERROR" || err?.fields) {
    return {
      status: err.status || 400,
      type: "VALIDATION_ERROR",
      message: err.message || "Please fix the highlighted fields.",
      fields: err.fields || {},
    };
  }

  // Multer upload errors (file type/size/count/unexpected field).
  if (err?.name === "MulterError" || /^Multer error:/.test(err?.message || "")) {
    const code = err.code;
    const field = err.field;
    const msg = FRIENDLY[code] ||
      "Upload problem — this file could not be processed. Please check the selected upload field and try again.";
    return {
      status: 400,
      type: "UPLOAD_ERROR",
      message: msg,
      fields: field ? { [field]: msg } : {},
    };
  }

  // Mongoose validation error → per-path messages.
  if (err?.name === "ValidationError" && err?.errors) {
    const fields = {};
    for (const [path, e] of Object.entries(err.errors)) {
      fields[path] = e?.message || "This value is invalid.";
    }
    return { status: 400, type: "VALIDATION_ERROR", message: "Please fix the highlighted fields.", fields };
  }

  // Duplicate key (unique index), e.g. email already exists.
  if (err?.code === 11000) {
    const key = Object.keys(err.keyPattern || err.keyValue || {})[0] || "value";
    const msg = `This ${key.replace(/([A-Z])/g, " $1").toLowerCase()} is already in use.`;
    return { status: 409, type: "DUPLICATE_ERROR", message: msg, fields: { [key]: msg } };
  }

  // Bad ObjectId etc.
  if (err?.name === "CastError") {
    return { status: 400, type: "BAD_REQUEST", message: "Some information was in an unexpected format. Please review and try again.", fields: {} };
  }

  return {
    status: err?.status || 500,
    type: err?.status ? "REQUEST_ERROR" : "SERVER_ERROR",
    message: err?.status ? (err.message || "Request failed.") : "Something went wrong on our end. Please try again.",
    fields: {},
  };
};

export const serverError = (err, _req, res, _next) => {
  const n = normalize(err);
  if (n.status >= 500) console.error(err?.stack || err);
  res.status(n.status).json({
    success: false,
    // Top-level message kept for backward compatibility with existing clients.
    message: n.message,
    error: { type: n.type, message: n.message, fields: n.fields },
  });
};

export const catchAsync =
  (handler) =>
  (...args) =>
    handler(...args).catch(args[2]);
