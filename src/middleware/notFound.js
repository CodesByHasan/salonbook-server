import { ApiError } from "../utils/ApiError.js";

// Runs when no route matches the request.
export function notFound(req, res, next) {
  next(
    new ApiError(
      404,
      `Route not found: ${req.method} ${req.originalUrl}`
    )
  );
}
