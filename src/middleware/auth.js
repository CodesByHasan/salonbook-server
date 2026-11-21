import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { usersCollection } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";

// Public keys of this server's Better Auth. jose caches them.
const JWKS = createRemoteJWKSet(new URL(env.AUTH_JWKS_URL));


export async function verifyJWT(req, res, next) {
  const [authType, token] = (req.headers.authorization ?? "").split(" ");

  if (authType !== "Bearer" || !token) {
    throw new ApiError(401, "Unauthorized: Token is required");
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: env.BETTER_AUTH_URL,
      audience: env.BETTER_AUTH_URL,
    }));
  } catch {
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