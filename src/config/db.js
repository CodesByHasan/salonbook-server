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


async function dropOldSlotIndex() {
  const indexes = await appointmentsCollection.indexes().catch(() => []);
  const old = indexes.find((index) => index.name === "unique_locked_slot" && index.key.date);

  if (old) await appointmentsCollection.dropIndex("unique_locked_slot");
}


async function renameOldFields() {
  await Promise.all([
    servicesCollection.updateMany({ name: { $exists: true } }, { $rename: { name: "serviceName" } }),
    appointmentsCollection.updateMany(
      { userId: { $exists: true } },
      { $rename: { userId: "customerId", date: "appointmentDate", notes: "message" } },
    ),
    transactionsCollection.updateMany({ userId: { $exists: true } }, { $rename: { userId: "customerId" } }),
  ]);
}

export async function connectDB() {
  await client.connect();
  await db.command({ ping: 1 });

  await dropOldSlotIndex();
  await renameOldFields();

  await Promise.all([
    // One transaction per Stripe session.
    createIndex(transactionsCollection, { stripeSessionId: 1 }, { unique: true, name: "unique_stripe_session" }),


    createIndex(
      appointmentsCollection,
      { serviceId: 1, appointmentDate: 1, timeSlot: 1 },
      { unique: true, name: "unique_locked_slot", partialFilterExpression: { slotLocked: true } },
    ),
  ]);

  return db;
}

export async function closeDB() {
  await client.close();
}







