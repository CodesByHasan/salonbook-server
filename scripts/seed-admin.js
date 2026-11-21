import "dotenv/config";
import { MongoClient } from "mongodb";

const { MONGODB_URI, DB_NAME = "salonbook", ADMIN_EMAIL } = process.env;

if (!MONGODB_URI) throw new Error("MONGODB_URI is missing from .env");
if (!ADMIN_EMAIL) throw new Error("ADMIN_EMAIL is missing from .env");

const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();

  // Better Auth's MongoDB user collection is "user" (singular).
  const result = await client
    .db(DB_NAME)
    .collection("user")
    .updateOne(
      { email: ADMIN_EMAIL.trim().toLowerCase() },
      { $set: { role: "admin", isBlocked: false, updatedAt: new Date() } },
    );

  if (result.matchedCount === 0) {
    throw new Error("Admin account not found. Sign up with this email first.");
  }

  console.log(`Admin role assigned successfully to ${ADMIN_EMAIL}`);
} catch (error) {
  console.error("Admin seeding failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}