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

// Builds the Express app. Does not start listening (see src/index.js and api/index.js).

const app = express();

// Vercel sits behind a proxy.
app.set("trust proxy", 1);

app.use(helmet());

// Only the frontend origin may call this API from a browser.
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));

if (env.NODE_ENV !== "production") app.use(morgan("dev"));

app.all("/api/auth/*splat", toNodeHandler(auth));


app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhook);

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.send("SalonBook server is running!");
});

app.use("/api", routes);

// Must come after all routes.
app.use(notFound);
app.use(errorHandler);

export default app;