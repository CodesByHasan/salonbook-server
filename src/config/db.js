import { MongoClient } from "mongodb";
import { env } from "./env.js";

export const client = new MongoClient(env.MONGODB_URI);

export const db = client.db(env.DB_NAME);

// Better Auth.
export const usersCollection = db.collection("user");

// Application collections.
export const servicesCollection = db.collection("services");
export const appointmentsCollection = db.collection("appointments");
export const transactionsCollection = db.collection("transactions");

// Connect to MongoDB.
export async function connectDB() {
  await client.connect();
  await db.command({ ping: 1 });

  // One transaction per Stripe session.
  await transactionsCollection.createIndex(
    { stripeSessionId: 1 },
    { unique: true, name: "unique_stripe_session" }
  );

  console.log(`MongoDB connected: ${env.DB_NAME}`);

  return db;
}

// Close connection.
export async function closeDB() {
  await client.close();
}







