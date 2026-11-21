import { Router } from "express";
import { appointmentsCollection, paymentsCollection } from "../../config/db.js";
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

// Stripe charges in USD in test mode. The amount always comes from the database.
const toCents = (bdt) => Math.round(bdt * env.BDT_TO_USD_RATE * 100);

// Never leak Stripe error details to the browser.
function paymentError(error, message) {
  console.error("Stripe error:", error);
  return new ApiError(502, message);
}

// POST /api/payments/create-checkout-session (customer): own + confirmed + unpaid only.
router.post("/create-checkout-session", verifyJWT, validate(createCheckoutSessionSchema), async (req, res) => {
  const { appointmentId } = req.valid.body;
  const _id = toObjectId(appointmentId, "Appointment not found");

  const appointment = await appointmentsCollection.findOne({ _id, userId: req.user.id });
  if (!appointment) throw new ApiError(404, "Appointment not found");
  if (appointment.status !== "confirmed") {
    throw new ApiError(409, "Only confirmed appointments can be paid");
  }
  if (appointment.paymentStatus === "paid") {
    throw new ApiError(409, "This appointment is already paid");
  }

  // Reuse the checkout session if it is still open (double clicks, page reloads).
  if (appointment.checkoutSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(appointment.checkoutSessionId);
      if (existing.status === "open" && existing.url) {
        return sendSuccess(res, { url: existing.url }, "Checkout session ready");
      }
    } catch {
      // Could not reuse it: create a new one below.
    }
  }

  const unitAmount = toCents(appointment.servicePrice);
  if (unitAmount < 50) {
    throw new ApiError(400, "This amount is below the minimum card payment");
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create({
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
  } catch (error) {
    throw paymentError(error, "Could not start the payment. Please try again.");
  }

  await appointmentsCollection.updateOne(
    { _id },
    { $set: { checkoutSessionId: session.id, updatedAt: new Date() } },
  );

  sendSuccess(res, { url: session.url }, "Checkout session created", 201);
});

// GET /api/payments/session-status?session_id=cs_test_... (owner or admin)
// Used by the /payment/success page.
router.get("/session-status", verifyJWT, validate(sessionStatusQuerySchema, "query"), async (req, res) => {
  const { session_id } = req.valid.query;

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id);
  } catch (error) {
    if (error?.code === "resource_missing") throw new ApiError(404, "Payment session not found");
    throw paymentError(error, "Could not check the payment. Please try again.");
  }

  if (session.metadata?.userId !== req.user.id && req.user.role !== "admin") {
    throw new ApiError(403, "Forbidden: this payment belongs to another account");
  }

  // "recorded" = the webhook has already saved the payment and marked the appointment paid.
  const recorded = Boolean(
    await paymentsCollection.findOne({ stripeSessionId: session.id }, { projection: { _id: 1 } }),
  );

  sendSuccess(
    res,
    {
      sessionStatus: session.status,
      paymentStatus: session.payment_status,
      appointmentId: session.metadata?.appointmentId ?? null,
      amount: (session.amount_total ?? 0) / 100,
      currency: session.currency,
      recorded,
    },
    "Session status fetched",
  );
});

// GET /api/payments/transactions (admin, read-only): ?status=&page=&limit=
router.get("/transactions", verifyJWT, requireRole("admin"), validate(transactionsQuerySchema, "query"), async (req, res) => {
  const { status, page, limit } = req.valid.query;
  const filter = status ? { status } : {};

  const [items, total] = await Promise.all([
    paymentsCollection.find(filter).sort({ createdAt: -1 }).skip(getSkip(page, limit)).limit(limit).toArray(),
    paymentsCollection.countDocuments(filter),
  ]);

  sendSuccess(res, items, "Transactions fetched successfully", 200, buildMeta(page, limit, total));
});

export default router;