import { Router } from "express";
import authRouter from "./auth/index.js";

const router = Router();

router.use("/auth", authRouter);

// Keep your existing route mounts here:
// router.use("/users", usersRouter);
// router.use("/services", servicesRouter);
// router.use("/bookings", bookingsRouter);

export default router;