import { MongoClient } from "mongodb";
import { env } from "./env.js";

export const client = new MongoClient(env.MONGODB_URI);
export const db = client.db(env.DB_NAME);

// Better Auth uses the singular "user" collection by default.
export const usersCollection = db.collection("user");

export const servicesCollection = db.collection("services");
export const appointmentsCollection = db.collection("appointments");

// Payment records are stored as transactions.
export const transactionsCollection = db.collection("transactions");

// Temporary compatibility for existing route files.
// Batch 2 will use transactionsCollection directly.
export const paymentsCollection = transactionsCollection;

// Important indexes for booking and payment integrity.
async function ensureIndexes() {
  const indexes = [
    [
      appointmentsCollection,
      { serviceId: 1, date: 1, timeSlot: 1 },
      {
        name: "unique_locked_slot",
        unique: true,
        partialFilterExpression: { slotLocked: true },
      },
    ],
    [
      transactionsCollection,
      { stripeSessionId: 1 },
      { name: "unique_stripe_session", unique: true },
    ],
    [
      appointmentsCollection,
      { userId: 1, startsAt: -1 },
      { name: "user_appointments" },
    ],
  ];

  for (const [collection, keys, options] of indexes) {
    await collection.createIndex(keys, options);
  }
}

// Connect to MongoDB and verify the connection.
export async function connectDB() {
  await client.connect();
  await db.command({ ping: 1 });

  await ensureIndexes();

  console.log(`MongoDB connected: ${env.DB_NAME}`);

  return db;
}

// Close the MongoDB connection.
export async function closeDB() {
  await client.close();
}






