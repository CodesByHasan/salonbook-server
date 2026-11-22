import app from "../src/app.js";
import { connectDB } from "../src/config/db.js";

// Reuse the database connection in warm Vercel instances.
let ready = null;

export default async function handler(req, res) {
  try {
    ready ??= connectDB();
    await ready;
  } catch (error) {
    ready = null;

    console.error("Database connection failed:", error);

    return res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }

  return app(req, res);
}