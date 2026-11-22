import { Router } from "express";
import { appointmentsCollection, transactionsCollection } from "../../config/db.js";
import { env } from "../../config/env.js";
import { stripe } from "../../config/stripe.js";
import { verifyJWT, requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { buildMeta, getSkip, toObjectId } from "../../utils/helpers.js";
import {
  createCheckoutSessionSchema,
  sessionStatusQuerySchema,
  transactionsQuerySchema,
} from "../../validators/payment.js";

// Mounted at /api/payments

const router = Router();

// POST /api/payments/create-checkout-session (customer)
// Only the customer's own, confirmed, unpaid appointment. The price comes from the database.
router.post("/create-checkout-session", verifyJWT, validate(createCheckoutSessionSchema), async (req, res) => {
  const { appointmentId } = req.valid.body;
  const _id = toObjectId(appointmentId, "Appointment not found");


  const appointment = await appointmentsCollection.findOne({ _id, userId: req.user.id });

  if (!appointment) throw new ApiError(404, "Appointment not found");
  if (appointment.status !== "confirmed") throw new ApiError(409, "Only confirmed appointments can be paid");
  if (appointment.paymentStatus === "paid") throw new ApiError(409, "This appointment is already paid");

 
  if (appointment.checkoutSessionId) {
    const old = await stripe.checkout.sessions.retrieve(appointment.checkoutSessionId).catch(() => null);

    if (old?.payment_status === "paid") {
      throw new ApiError(409, "Your payment was received. The appointment updates as soon as Stripe confirms it.");
    }
    if (old?.status === "open" && old.url) {
      return sendSuccess(res, { url: old.url }, "Checkout session ready");
    }
  }


  const unitAmount = Math.round(appointment.servicePrice * env.BDT_TO_USD_RATE * 100);
  if (unitAmount < 50) throw new ApiError(400, "This amount is below the minimum card payment");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: req.user.email,
    client_reference_id: appointmentId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          product_data: {
            name: appointment.serviceName,
            description: `${appointment.date} at ${appointment.timeSlot}`,
          },
        },
      },
    ],
    // The webhook reads these to find the appointment.
    metadata: { appointmentId, userId: req.user.id },
    success_url: `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.CLIENT_URL}/payment/cancel?appointment_id=${appointmentId}`,
  });

  await appointmentsCollection.updateOne(
    { _id },
    { $set: { checkoutSessionId: session.id, updatedAt: new Date() } },
  );

  sendSuccess(res, { url: session.url }, "Checkout session created", 201);
});

// GET /api/payments/session-status?session_id=cs_test_... (owner or admin)
// Read-only. Used by the /payment/success page to wait for the webhook.
router.get("/session-status", verifyJWT, validate(sessionStatusQuerySchema, "query"), async (req, res) => {
  const session = await stripe.checkout.sessions.retrieve(req.valid.query.session_id).catch(() => null);
  if (!session) throw new ApiError(404, "Payment session not found");

  const { appointmentId, userId } = session.metadata ?? {};

  if (userId !== req.user.id && req.user.role !== "admin") {
    throw new ApiError(403, "Forbidden: this payment belongs to another account");
  }

  const [transaction, appointment] = await Promise.all([
    transactionsCollection.findOne({ stripeSessionId: session.id }, { projection: { _id: 1 } }),
    appointmentId
      ? appointmentsCollection.findOne({ _id: toObjectId(appointmentId) }, { projection: { paymentStatus: 1 } })
      : null,
  ]);

  sendSuccess(
    res,
    {
      sessionStatus: session.status,
      paymentStatus: session.payment_status,
      appointmentId: appointmentId ?? null,
      amount: (session.amount_total ?? 0) / 100,
      currency: session.currency,
      recorded: Boolean(transaction), // the webhook saved the transaction
      appointmentPaymentStatus: appointment?.paymentStatus ?? "unpaid", // and marked the appointment paid
    },
    "Session status fetched",
  );
});

// GET /api/payments/transactions (admin, read-only): ?status=&page=&limit=
router.get("/transactions", verifyJWT, requireRole("admin"), validate(transactionsQuerySchema, "query"), async (req, res) => {
  const { status, page, limit } = req.valid.query;
  const filter = status ? { status } : {};

  const [items, total] = await Promise.all([
    transactionsCollection.find(filter).sort({ createdAt: -1 }).skip(getSkip(page, limit)).limit(limit).toArray(),
    transactionsCollection.countDocuments(filter),
  ]);

  sendSuccess(res, items, "Transactions fetched successfully", 200, buildMeta(page, limit, total));
});

export default router;
