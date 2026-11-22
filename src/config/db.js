import { MongoClient } from "mongodb";
import { env } from "./env.js";

export const client = new MongoClient(env.MONGODB_URI);
export const db = client.db(env.DB_NAME);

// "user" (singular) is the collection Better Auth creates.
export const usersCollection = db.collection("user");
export const servicesCollection = db.collection("services");
export const appointmentsCollection = db.collection("appointments");
export const transactionsCollection = db.collection("transactions");

// A failed index only logs a warning, so the server still starts.
const createIndex = (collection, keys, options) =>
  collection.createIndex(keys, options).catch((error) => {
    console.warn(`Index "${options.name}" was not created: ${error.message}`);
  });

export async function connectDB() {
  await client.connect();
  await db.command({ ping: 1 });

  await Promise.all([
    // One transaction per Stripe session.
    createIndex(transactionsCollection, { stripeSessionId: 1 }, { unique: true, name: "unique_stripe_session" }),

    // One live appointment per service, date and time slot (slotLocked is removed on cancel).
    createIndex(
      appointmentsCollection,
      { serviceId: 1, date: 1, timeSlot: 1 },
      { unique: true, name: "unique_locked_slot", partialFilterExpression: { slotLocked: true } },
    ),
  ]);

  return db;
}

export async function closeDB() {
  await client.close();
}







