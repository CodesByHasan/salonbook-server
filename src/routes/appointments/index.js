import { Router } from "express";
import { appointmentsCollection, servicesCollection } from "../../config/db.js";
import { stripe } from "../../config/stripe.js";
import { verifyJWT, requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { buildMeta, dhakaDateTime, getSkip, toObjectId } from "../../utils/helpers.js";
import {
  createAppointmentSchema,
  myAppointmentsQuerySchema,
  adminAppointmentsQuerySchema,
} from "../../validators/appointment.js";

// Mounted at /api/appointments

const router = Router();

// Pending/confirmed appointments hold their slot (slotLocked: true).
// Cancelling removes the flag so the slot can be booked again.
const cancelUpdate = (cancelledBy) => ({
  $set: { status: "cancelled", cancelledBy, cancelledAt: new Date(), updatedAt: new Date() },
  $unset: { slotLocked: "" },
});

// After a failed conditional update, say WHY (not found vs wrong state).
async function explainFailure(filter, wrongStateMessage) {
  const exists = await appointmentsCollection.findOne(filter, { projection: { _id: 1 } });
  if (!exists) throw new ApiError(404, "Appointment not found");
  throw new ApiError(409, wrongStateMessage);
}

// A cancelled appointment must not be payable through an old checkout link.
async function expireCheckout(appointment) {
  if (!appointment?.checkoutSessionId) return;
  try {
    await stripe.checkout.sessions.expire(appointment.checkoutSessionId);
  } catch {
    // Already expired or completed: nothing to do.
  }
}

// POST /api/appointments (customer)
router.post("/", verifyJWT, validate(createAppointmentSchema), async (req, res) => {
  if (req.user.role === "admin") throw new ApiError(403, "Admins cannot book appointments");

  const { serviceId, date, timeSlot, notes } = req.valid.body;

  // Past dates/times are blocked (Asia/Dhaka time).
  const startsAt = dhakaDateTime(date, timeSlot);
  if (startsAt <= new Date()) throw new ApiError(400, "You cannot book a past date or time");

  const service = await servicesCollection.findOne({ _id: toObjectId(serviceId, "Service not found") });
  if (!service) throw new ApiError(404, "Service not found");
  if (service.status !== "active") throw new ApiError(409, "This service is currently unavailable");

  const now = new Date();
  const appointment = {
    userId: req.user.id,
    userName: req.user.name,
    userEmail: req.user.email,
    serviceId: service._id,
    // Snapshot, so history stays correct if the service is edited later.
    serviceName: service.name,
    servicePrice: service.price,
    serviceDuration: service.duration,
    serviceImage: service.image,
    serviceCategory: service.category,
    date,
    timeSlot,
    startsAt,
    notes: notes ?? "",
    status: "pending",
    paymentStatus: "unpaid",
    slotLocked: true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await appointmentsCollection.insertOne(appointment);
    sendSuccess(res, { ...appointment, _id: result.insertedId }, "Appointment requested successfully", 201);
  } catch (error) {
    // The unique slot index rejected it: someone already holds this slot.
    if (error?.code === 11000) {
      throw new ApiError(409, "This time slot is already booked. Please choose another.");
    }
    throw error;
  }
});

// GET /api/appointments/my (customer): own appointments, newest first.
router.get("/my", verifyJWT, validate(myAppointmentsQuerySchema, "query"), async (req, res) => {
  const { status } = req.valid.query;
  const filter = { userId: req.user.id, ...(status && { status }) };

  const items = await appointmentsCollection.find(filter).sort({ startsAt: -1 }).toArray();
  sendSuccess(res, items, "Appointments fetched successfully");
});

// GET /api/appointments/admin (admin): ?status=&date=&page=&limit=
router.get("/admin", verifyJWT, requireRole("admin"), validate(adminAppointmentsQuerySchema, "query"), async (req, res) => {
  const { status, date, page, limit } = req.valid.query;
  const filter = { ...(status && { status }), ...(date && { date }) };

  const [items, total] = await Promise.all([
    appointmentsCollection.find(filter).sort({ startsAt: -1 }).skip(getSkip(page, limit)).limit(limit).toArray(),
    appointmentsCollection.countDocuments(filter),
  ]);

  sendSuccess(res, items, "Appointments fetched successfully", 200, buildMeta(page, limit, total));
});

// PATCH /api/appointments/:id/cancel (customer): only own + pending.
router.patch("/:id/cancel", verifyJWT, async (req, res) => {
  const filter = { _id: toObjectId(req.params.id, "Appointment not found"), userId: req.user.id };

  // One atomic update: no race between "check status" and "cancel".
  const updated = await appointmentsCollection.findOneAndUpdate(
    { ...filter, status: "pending" },
    cancelUpdate("user"),
    { returnDocument: "after" },
  );

  if (!updated) await explainFailure(filter, "Only pending appointments can be cancelled");

  sendSuccess(res, updated, "Appointment cancelled");
});

// PATCH /api/appointments/admin/:id/confirm (admin): only pending.
router.patch("/admin/:id/confirm", verifyJWT, requireRole("admin"), async (req, res) => {
  const filter = { _id: toObjectId(req.params.id, "Appointment not found") };

  const updated = await appointmentsCollection.findOneAndUpdate(
    { ...filter, status: "pending" },
    { $set: { status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) await explainFailure(filter, "Only pending appointments can be confirmed");

  sendSuccess(res, updated, "Appointment confirmed");
});

// PATCH /api/appointments/admin/:id/cancel (admin): pending or confirmed, never after payment.
router.patch("/admin/:id/cancel", verifyJWT, requireRole("admin"), async (req, res) => {
  const filter = { _id: toObjectId(req.params.id, "Appointment not found") };

  const updated = await appointmentsCollection.findOneAndUpdate(
    { ...filter, status: { $in: ["pending", "confirmed"] }, paymentStatus: { $ne: "paid" } },
    cancelUpdate("admin"),
    { returnDocument: "after" },
  );

  if (!updated) {
    await explainFailure(filter, "This appointment is already cancelled or has been paid");
  }

  await expireCheckout(updated);

  sendSuccess(res, updated, "Appointment cancelled");
});

export default router;