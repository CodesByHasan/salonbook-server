import { env } from "./config/env.js";
import { connectDB, closeDB } from "./config/db.js";
import app from "./app.js";

async function startServer() {
  try {
    await connectDB();

    const server = app.listen(env.PORT, () => {
      console.log(`SalonBook server running at http://localhost:${env.PORT}`);
    });

    // Close the server and database cleanly.
    async function shutdown() {
      console.log("Shutting down SalonBook server...");

      server.close(async () => {
        try {
          await closeDB();
          console.log("MongoDB connection closed.");
          process.exit(0);
        } catch (error) {
          console.error("Shutdown error:", error);
          process.exit(1);
        }
      });
    }

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    console.error("Failed to start SalonBook server:", error);
    process.exit(1);
  }
}

startServer();

