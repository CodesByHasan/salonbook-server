import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectToMongoDB } from "./config/db.js";

const app = express();
const port = process.env.PORT || 8000;

// middleware
app.use(express.json());
app.use(cors());

// database connection
const connectedClient = await connectToMongoDB();

const database = connectedClient.db(process.env.DB_NAME || "salonbook");

// collections
const users = database.collection("users");
const services = database.collection("services");
const bookings = database.collection("bookings");
const payments = database.collection("payments");

// home route
app.get("/", (req, res) => {
  res.send("SalonBook server is running!");
});

// get all users
app.get("/users", async (req, res) => {
  const result = await users.find({}).toArray();
  res.send(result);
});

// get all services
app.get("/services", async (req, res) => {
  const result = await services.find({}).toArray();
  res.send(result);
});

// get all bookings
app.get("/bookings", async (req, res) => {
  const result = await bookings.find({}).toArray();
  res.send(result);
});

// start server
app.listen(port, () => {
  console.log(`SalonBook server is running on port ${port}`);
});
