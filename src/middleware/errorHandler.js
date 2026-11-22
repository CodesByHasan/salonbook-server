export function errorHandler(err, req, res, next) {
  // If a response was already started, let Express handle it.
  if (res.headersSent) {
    return next(err);
  }

  // Invalid JSON request body.
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body",
    });
  }

  // Multer upload errors.
  if (err.name === "MulterError") {
    const tooBig = err.code === "LIMIT_FILE_SIZE";

    return res.status(tooBig ? 413 : 400).json({
      success: false,
      message: tooBig
        ? "Image must be 4 MB or smaller"
        : err.message,
    });
  }

  const statusCode = err.statusCode || err.status || 500;

  // Do not expose internal server errors to users.
  if (statusCode >= 500) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }

  return res.status(statusCode).json({
    success: false,
    message: err.message || "Something went wrong",
    ...(err.details && { errors: err.details }),
  });
}

