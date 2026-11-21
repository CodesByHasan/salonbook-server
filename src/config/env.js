import "dotenv/config";

// Central place for environment variables.
const isProduction = process.env.NODE_ENV === "production";

const required = [
  "MONGODB_URI",
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  // On Vercel these must be set explicitly (no localhost fallbacks).
  ...(isProduction ? ["CLIENT_URL", "BETTER_AUTH_URL"] : []),
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env and fill them in.`,
  );
}

const stripTrailingSlash = (value) => value.replace(/\/+$/, "");

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = stripTrailingSlash(process.env.CLIENT_URL || "http://localhost:3000");

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT,
  MONGODB_URI: process.env.MONGODB_URI,
  DB_NAME: process.env.DB_NAME || "salonbook",

  // Frontend origin (CORS, Better Auth trusted origin, Stripe return URLs).
  CLIENT_URL,
  // Public auth URL = client origin (Next proxies /api/* here). Also the JWT issuer and audience.
  BETTER_AUTH_URL: stripTrailingSlash(process.env.BETTER_AUTH_URL || CLIENT_URL),
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  AUTH_JWKS_URL: process.env.AUTH_JWKS_URL || `http://localhost:${PORT}/api/auth/jwks`,

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,

  IMGBB_API_KEY: process.env.IMGBB_API_KEY,

  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  BDT_TO_USD_RATE: Number(process.env.BDT_TO_USD_RATE) || 0.00804,
};