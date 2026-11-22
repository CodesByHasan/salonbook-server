import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { toNodeHandler } from "better-auth/node";

import { env } from "./config/env.js";
import { auth } from "./config/auth.js";

import routes from "./routes/index.js";
import { stripeWebhook } from "./routes/payments/webhook.js";

import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);

if (env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// Better Auth.
app.all("/api/auth/*splat", toNodeHandler(auth));

// Stripe webhook MUST be registered before express.json().
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

// Normal API JSON requests.
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.send("SalonBook server is running!");
});

// All application routes.
app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;

