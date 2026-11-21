import { Router } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import usersRouter from "./users/index.js";
import servicesRouter from "./services/index.js";
import appointmentsRouter from "./appointments/index.js";
import paymentsRouter from "./payments/index.js";
import statsRouter from "./stats/index.js";
import uploadRouter from "./upload/index.js";

// All API routes live under /api (see app.js). /api/auth/* and /api/webhooks/stripe are handled before these.

const router = Router();

// GET /api/health: quick check that the server is up.
router.get("/health", (req, res) => {
  sendSuccess(res, { status: "ok" }, "API is running");
});

router.use("/users", usersRouter);
router.use("/services", servicesRouter);
router.use("/appointments", appointmentsRouter);
router.use("/payments", paymentsRouter);
router.use("/stats", statsRouter);
router.use("/upload", uploadRouter);

export default router;