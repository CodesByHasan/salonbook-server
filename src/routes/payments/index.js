import { Router } from "express";
import {
  appointmentsCollection,
  transactionsCollection,
} from "../../config/db.js";
import { env } from "../../config/env.js";
import { stripe } from "../../config/stripe.js";
import { verifyJWT, requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  buildMeta,
  getSkip,
  toObjectId,
} from "../../utils/helpers.js";
import {
  createCheckoutSessionSchema,
  sessionStatusQuerySchema,
  transactionsQuerySchema,
} from "../../validators/payment.js";

// Mounted at /api/payments

const router = Router();

// Convert BDT to USD cents.
const toCents = (bdt) =>
  Math.round(bdt * env.BDT_TO_USD_RATE * 100);

// Keep Stripe's internal error details out of API responses.
function paymentError(error, message) {
  console.error("Stripe error:", error);
  return new ApiError(502, message);
}

// POST /api/payments/create-checkout-session
router.post(
  "/create-checkout-session",
  verifyJWT,
  validate(createCheckoutSessionSchema),
  async (req, res) => {
    const { appointmentId } = req.valid.body;
    const _id = toObjectId(appointmentId, "Appointment not found");

    const appointment = await appointmentsCollection.findOne({
      _id,
      userId: req.user.id,
    });

    if (!appointment) {
      throw new ApiError(404, "Appointment not found");
    }

    if (appointment.status !== "confirmed") {
      throw new ApiError(409, "Only confirmed appointments can be paid");
    }

    if (appointment.paymentStatus === "paid") {
      throw new ApiError(409, "This appointment is already paid");
    }

    // Reuse an existing open session to prevent duplicate Checkout sessions.
    if (appointment.checkoutSessionId) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(
          appointment.checkoutSessionId,
        );

        // Do not fulfill here.
        // The verified webhook is the only place that records payment.
        if (existing.payment_status === "paid") {
          throw new ApiError(
            409,
            "Payment is processing. Please wait for confirmation.",
          );
        }

        if (existing.status === "open" && existing.url) {
          return sendSuccess(
            res,
            { url: existing.url },
            "Checkout session ready",
          );
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;

        // If the old session cannot be reused, create a new one.
      }
    }

    const unitAmount = toCents(appointment.servicePrice);

    if (unitAmount < 50) {
      throw new ApiError(
        400,
        "This amount is below the minimum card payment",
      );
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

        metadata: {
          appointmentId,
          userId: req.user.id,
        },

        success_url: `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.CLIENT_URL}/payment/cancel?appointment_id=${appointmentId}`,
      });
    } catch (error) {
      throw paymentError(
        error,
        "Could not start the payment. Please try again.",
      );
    }

    await appointmentsCollection.updateOne(
      {
        _id,
        userId: req.user.id,
        status: "confirmed",
        paymentStatus: { $ne: "paid" },
      },
      {
        $set: {
          checkoutSessionId: session.id,
          updatedAt: new Date(),
        },
      },
    );

    return sendSuccess(
      res,
      { url: session.url },
      "Checkout session created",
      201,
    );
  },
);

// GET /api/payments/session-status?session_id=cs_test_...
// Owner or admin: reads Stripe and database status.
// It must NEVER write payment records or mark appointments as paid.
router.get(
  "/session-status",
  verifyJWT,
  validate(sessionStatusQuerySchema, "query"),
  async (req, res) => {
    const { session_id } = req.valid.query;

    let session;

    try {
      session = await stripe.checkout.sessions.retrieve(session_id);
    } catch (error) {
      if (error?.code === "resource_missing") {
        throw new ApiError(404, "Payment session not found");
      }

      throw paymentError(
        error,
        "Could not check the payment. Please try again.",
      );
    }

    if (
      session.metadata?.userId !== req.user.id &&
      req.user.role !== "admin"
    ) {
      throw new ApiError(
        403,
        "Forbidden: this payment belongs to another account",
      );
    }

    // The webhook writes this record after verifying its signature.
    const recorded = Boolean(
      await transactionsCollection.findOne(
        { stripeSessionId: session.id },
        { projection: { _id: 1 } },
      ),
    );

    return sendSuccess(
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
  },
);

// GET /api/payments/transactions
// Admin only: read-only transaction list.
router.get(
  "/transactions",
  verifyJWT,
  requireRole("admin"),
  validate(transactionsQuerySchema, "query"),
  async (req, res) => {
    const { status, page, limit } = req.valid.query;
    const filter = status ? { status } : {};

    const [items, total] = await Promise.all([
      transactionsCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(getSkip(page, limit))
        .limit(limit)
        .toArray(),

      transactionsCollection.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      items,
      "Transactions fetched successfully",
      200,
      buildMeta(page, limit, total),
    );
  },
);

export default router;