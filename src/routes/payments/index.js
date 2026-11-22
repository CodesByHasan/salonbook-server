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

const router = Router();

// Convert BDT to USD cents.
const toCents = (bdt) =>
  Math.round(Number(bdt) * env.BDT_TO_USD_RATE * 100);

// Stripe error handler.
function paymentError(error, message) {
  console.error("Stripe error:", error.message);
  return new ApiError(502, message);
}

// POST /api/payments/create-checkout-session
// Customer: own + confirmed + unpaid appointment.
router.post(
  "/create-checkout-session",
  verifyJWT,
  validate(createCheckoutSessionSchema),
  async (req, res) => {
    const { appointmentId } = req.valid.body;

    const _id = toObjectId(
      appointmentId,
      "Appointment not found"
    );

    const appointment = await appointmentsCollection.findOne({
      _id,
      userId: req.user.id,
    });

    if (!appointment) {
      throw new ApiError(404, "Appointment not found");
    }

    if (appointment.status !== "confirmed") {
      throw new ApiError(
        409,
        "Only confirmed appointments can be paid"
      );
    }

    if (appointment.paymentStatus === "paid") {
      throw new ApiError(
        409,
        "This appointment is already paid"
      );
    }

    // Reuse an existing Checkout Session.
    if (appointment.checkoutSessionId) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(
          appointment.checkoutSessionId
        );

        if (existing.payment_status === "paid") {
          return sendSuccess(
            res,
            {
              processing: true,
              sessionId: existing.id,
              url: `${env.CLIENT_URL}/payment/success?session_id=${existing.id}`,
            },
            "Payment is processing. Please wait for confirmation."
          );
        }

        if (existing.status === "open" && existing.url) {
          return sendSuccess(
            res,
            { url: existing.url },
            "Checkout session ready"
          );
        }
      } catch (error) {
        console.error(
          "Previous Checkout Session could not be reused:",
          error.message
        );
      }
    }

    const unitAmount = toCents(appointment.servicePrice);

    if (!Number.isSafeInteger(unitAmount) || unitAmount < 50) {
      throw new ApiError(
        400,
        "Invalid payment amount"
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

        success_url:
          `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,

        cancel_url:
          `${env.CLIENT_URL}/payment/cancel?appointment_id=${appointmentId}`,
      });
    } catch (error) {
      throw paymentError(
        error,
        "Could not create Stripe Checkout Session"
      );
    }

    // Save the session ID before redirecting the customer.
    const result = await appointmentsCollection.updateOne(
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
      }
    );

    if (result.matchedCount === 0) {
      throw new ApiError(
        409,
        "Appointment changed. Please try again."
      );
    }

    return sendSuccess(
      res,
      { url: session.url },
      "Checkout session created",
      201
    );
  }
);

// GET /api/payments/session-status
// Customer can check only their own payment.
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
      if (error.code === "resource_missing") {
        throw new ApiError(404, "Payment session not found");
      }

      throw paymentError(
        error,
        "Could not check payment status"
      );
    }

    if (
      session.metadata?.userId !== req.user.id &&
      req.user.role !== "admin"
    ) {
      throw new ApiError(
        403,
        "You cannot access another customer's payment"
      );
    }

    const transaction = await transactionsCollection.findOne({
      stripeSessionId: session.id,
    });

    const appointment = await appointmentsCollection.findOne({
      _id: toObjectId(
        session.metadata.appointmentId,
        "Appointment not found"
      ),
      userId: session.metadata.userId,
    });

    return sendSuccess(
      res,
      {
        sessionStatus: session.status,
        paymentStatus: session.payment_status,

        recorded: Boolean(transaction),

        appointmentPaymentStatus:
          appointment?.paymentStatus || "unpaid",

        appointmentId: session.metadata.appointmentId,
      },
      "Payment status fetched"
    );
  }
);

// GET /api/payments/transactions
// Admin only.
router.get(
  "/transactions",
  verifyJWT,
  requireRole("admin"),
  validate(transactionsQuerySchema, "query"),
  async (req, res) => {
    const { status, page, limit } = req.valid.query;

    const filter = status ? { status } : {};

    const [transactions, total] = await Promise.all([
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
      transactions,
      "Transactions fetched successfully",
      200,
      buildMeta(page, limit, total)
    );
  }
);

export default router;
