import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { toNodeHandler } from "better-auth/node";
import { env } from "./config/env.js";
import { auth } from "./config/auth.js";
import routes from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Builds the Express app.

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

// Only the frontend origin may call this API from a browser.
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));

if (env.NODE_ENV !== "production") app.use(morgan("dev"));

// Better Auth: /api/auth/* (sign-up, sign-in, Google, /token, /jwks ...).
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.send("SalonBook server is running!");
});

app.use("/api", routes);

// Must come after all routes.
app.use(notFound);
app.use(errorHandler);

export default app;