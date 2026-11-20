import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("SalonBook server is running!");
});

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;