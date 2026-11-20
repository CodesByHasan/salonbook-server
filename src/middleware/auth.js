import { createRemoteJWKSet, jwtVerify } from "jose";
import { ApiError } from "../utils/ApiError.js";

const AUTH_URL = process.env.CLIENT_URL || "http://localhost:3000";

const JWKS = createRemoteJWKSet(
  new URL(`${AUTH_URL}/api/auth/jwks`)
);

// Verify the JWT sent by the frontend.
export async function verifyJWT(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      throw new ApiError(401, "Unauthorized: Token is required");
    }

    const token = authorization.split(" ")[1];

    if (!token) {
      throw new ApiError(401, "Unauthorized: Token is required");
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_URL,
      audience: AUTH_URL,
    });

    req.user = {
      id: payload.sub || payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role || "user",
    };

    if (!req.user.id || !req.user.email) {
      throw new ApiError(401, "Invalid authentication token");
    }

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }

    next(new ApiError(401, "Unauthorized: Invalid or expired token"));
  }
}

// Check whether the authenticated user has an allowed role.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Unauthorized"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError(403, "Forbidden: You do not have permission")
      );
    }

    next();
  };
}