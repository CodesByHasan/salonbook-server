import "dotenv/config";
import { MongoClient } from "mongodb";

const DB_NAME = process.env.DB_NAME || "salonbook";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing from .env");
}

if (!ADMIN_EMAIL) {
  throw new Error("ADMIN_EMAIL is missing from .env");
}

const client = new MongoClient(process.env.MONGODB_URI);

try {
  await client.connect();

  const database = client.db(DB_NAME);

  // Better Auth's default MongoDB user collection is "user".
  const users = database.collection("user");

  const admin = await users.findOne({
    email: ADMIN_EMAIL,
  });

  if (!admin) {
    throw new Error(
      "Admin account not found. Sign up with this email first."
    );
  }

  await users.updateOne(
    { _id: admin._id },
    {
      $set: {
        role: "admin",
        updatedAt: new Date(),
      },
    }
  );

  console.log(`Admin role assigned successfully to ${ADMIN_EMAIL}`);
} catch (error) {
  console.error("Admin seeding failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}