import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";

const required = [
  "MONGODB_URI",
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  ...(isProduction ? ["CLIENT_URL", "BETTER_AUTH_URL"] : []),
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env and fill them in.`
  );
}

const stripTrailingSlash = (value) => value.replace(/\/+$/, "");

const PORT = Number(process.env.PORT) || 5001;
const CLIENT_URL = stripTrailingSlash(
  process.env.CLIENT_URL || "http://localhost:3000"
);

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT,

  // MongoDB
  MONGODB_URI: process.env.MONGODB_URI,
  DB_NAME: process.env.DB_NAME || "salonbook",

  // Application URLs
  CLIENT_URL,
  BETTER_AUTH_URL: stripTrailingSlash(
    process.env.BETTER_AUTH_URL || CLIENT_URL
  ),

  // Better Auth
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,

  // Image hosting
  IMGBB_API_KEY: process.env.IMGBB_API_KEY,

  // Stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

  // BDT to USD conversion rate for Stripe Checkout
  BDT_TO_USD_RATE: Number(process.env.BDT_TO_USD_RATE) || 0.00804,
};
