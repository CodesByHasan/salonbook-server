import app from "../src/app.js";
import { connectDB } from "../src/config/db.js";

// Vercel runs Express as a serverless function.
// The database connects once per warm instance and is reused.
let ready = null;

export default async function handler(req, res) {
  try {
    ready ??= connectDB();
    await ready;
  } catch (error) {
    ready = null; // try again on the next request
    console.error("Database connection failed:", error);
    return res.status(500).json({ success: false, message: "Database connection failed" });
  }

  return app(req, res);
}