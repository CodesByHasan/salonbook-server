import { Router } from "express";
import {
  appointmentsCollection,
  transactionsCollection,
  servicesCollection,
  usersCollection,
} from "../../config/db.js";
import {
  verifyJWT,
  requireRole,
} from "../../middleware/auth.js";
import { sendSuccess } from "../../utils/apiResponse.js";

// Mounted at /api/stats

const router = Router();

// GET /api/stats/admin
// Admin dashboard statistics.
router.get(
  "/admin",
  verifyJWT,
  requireRole("admin"),
  async (req, res) => {
    const [
      customers,
      activeServices,
      totalAppointments,
      pendingAppointments,
      confirmedAppointments,
      successfulPayments,
    ] = await Promise.all([
      usersCollection.countDocuments({
        role: { $ne: "admin" },
      }),

      servicesCollection.countDocuments({
        status: "active",
      }),

      appointmentsCollection.countDocuments({}),

      appointmentsCollection.countDocuments({
        status: "pending",
      }),

      appointmentsCollection.countDocuments({
        status: "confirmed",
      }),

      transactionsCollection.countDocuments({
        status: "paid",
      }),
    ]);

    return sendSuccess(
      res,
      {
        customers,
        activeServices,
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        successfulPayments,
      },
      "Stats fetched successfully",
    );
  },
);

export default router;