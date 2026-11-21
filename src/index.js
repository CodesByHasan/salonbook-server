import { env } from "./config/env.js";
import { connectDB, closeDB } from "./config/db.js";
import app from "./app.js";

// Local entry point: connect to MongoDB first, then start the HTTP server.
let server;

async function start() {
  try {
    await connectDB();
    console.log("Connected to MongoDB");

    server = app.listen(env.PORT, () => {
      console.log(`Server running on http://localhost:${env.PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

// Stop accepting requests and close the database when the process is stopped.
async function shutdown() {
  server?.close();
  await closeDB();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
