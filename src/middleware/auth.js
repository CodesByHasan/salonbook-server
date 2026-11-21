import { createLocalJWKSet, jwtVerify } from "jose";
import { auth } from "../config/auth.js";
import { env } from "../config/env.js";
import { usersCollection } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";

// Signing keys come straight from this server's Better Auth (no HTTP call to ourselves).
const KEY_TTL_MS = 5 * 60 * 1000;
let keyCache = { keys: null, loadedAt: 0 };

async function loadKeys(force = false) {
  if (!force && keyCache.keys && Date.now() - keyCache.loadedAt < KEY_TTL_MS) return keyCache.keys;
  const jwks = await auth.api.getJwks();
  keyCache = { keys: createLocalJWKSet(jwks), loadedAt: Date.now() };
  return keyCache.keys;
}

async function verifyToken(token) {
  const options = { issuer: env.BETTER_AUTH_URL, audience: env.BETTER_AUTH_URL };
  try {
    return (await jwtVerify(token, await loadKeys(), options)).payload;
  } catch (error) {
    // Keys may have rotated: reload once and retry.
    if (error?.code === "ERR_JWKS_NO_MATCHING_KEY") {
      return (await jwtVerify(token, await loadKeys(true), options)).payload;
    }
    throw error;
  }
}

export async function verifyJWT(req, res, next) {
  const [authType, token] = (req.headers.authorization ?? "").split(" ");

  if (authType !== "Bearer" || !token) {
    throw new ApiError(401, "Unauthorized: Token is required");
  }

  let payload;
  try {
    payload = await verifyToken(token);
  } catch (error) {
    if (env.NODE_ENV !== "production") {
      console.error(`[auth] JWT rejected: ${error?.code ?? error?.name}: ${error?.message}`);
    }
    throw new ApiError(401, "Unauthorized: Invalid or expired token");
  }

  const user = await usersCollection.findOne(
    { email: payload.email },
    { projection: { name: 1, email: 1, role: 1, isBlocked: 1 } },
  );

  if (!user) throw new ApiError(401, "Unauthorized: User no longer exists");
  if (user.isBlocked) throw new ApiError(403, "Your account has been blocked. Contact support.");

  req.user = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role ?? "user",
  };

  next();
}

// Allows only the listed roles. Use after verifyJWT.
// Example: router.get("/", verifyJWT, requireRole("admin"), handler)
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) throw new ApiError(401, "Unauthorized");

    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(403, "Forbidden: You do not have permission");
    }

    next();
  };
}