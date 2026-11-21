import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";
import { client, db } from "./db.js";
import { env } from "./env.js";

// Better Auth runs on this server and serves /api/auth/* (sign-up, sign-in, Google, /token, /jwks).
// Google redirect URI: {BETTER_AUTH_URL}/api/auth/callback/google

export const auth = betterAuth({
  database: mongodbAdapter(db, { client }),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.CLIENT_URL],

  emailAndPassword: { enabled: true, minPasswordLength: 8 },

  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },

  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "user", input: false },
      isBlocked: { type: "boolean", required: false, defaultValue: false, input: false },
      phone: { type: "string", required: false },
    },
  },

  plugins: [
    jwt({
      jwt: {
        // Issuer and audience default to baseURL. verifyJWT checks the same value.
        definePayload: ({ user }) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role || "user",
        }),
      },
    }),
  ],
});