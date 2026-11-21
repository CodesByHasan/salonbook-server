export function errorHandler(err, req, res, next) {
  // If a response was already started, let Express close the connection.
  if (res.headersSent) {
    return next(err);
  }

  // Bad JSON in the request body (thrown by express.json()).
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body",
    });
  }

  // Upload problems (multer).
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

  if (statusCode >= 500) {
    // Log the full error for the developer, but never send internal details to the client.
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
