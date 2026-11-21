import { MongoClient } from "mongodb";
import { env } from "./env.js";

export const client = new MongoClient(env.MONGODB_URI);
export const db = client.db(env.DB_NAME);


export async function connectDB() {
  await client.connect();
  await db.command({ ping: 1 });
  return db;
}

// "user" (singular) is the collection Better Auth creates.
export const usersCollection = db.collection("user");
export const servicesCollection = db.collection("services");
export const appointmentsCollection = db.collection("appointments");

export async function closeDB() {
  await client.close();
}
