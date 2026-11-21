import { MongoClient } from "mongodb";
import { env } from "./env.js";

export const client = new MongoClient(env.MONGODB_URI);
export const db = client.db(env.DB_NAME);

// "user" (singular) is the collection Better Auth creates.
export const usersCollection = db.collection("user");
export const servicesCollection = db.collection("services");
export const appointmentsCollection = db.collection("appointments");
export const paymentsCollection = db.collection("payments");

// The code relies on these: one live booking per slot, one payment row per Stripe session.
async function ensureIndexes() {
  const specs = [
    [
      appointmentsCollection,
      { serviceId: 1, date: 1, timeSlot: 1 },
      { name: "unique_locked_slot", unique: true, partialFilterExpression: { slotLocked: true } },
    ],
    [paymentsCollection, { stripeSessionId: 1 }, { name: "unique_stripe_session", unique: true }],
    [appointmentsCollection, { userId: 1, startsAt: -1 }, { name: "user_appointments" }],
  ];

  for (const [collection, keys, options] of specs) {
    try {
      await collection.createIndex(keys, options);
    } catch (error) {
      // e.g. an equivalent index already exists with other options, or old data has duplicates.
      console.warn(`Index "${options.name}" was not created: ${error.message}`);
    }
  }
}

export async function connectDB() {
  await client.connect();
  await db.command({ ping: 1 });
  await ensureIndexes();
  return db;
}

export async function closeDB() {
  await client.close();
}





