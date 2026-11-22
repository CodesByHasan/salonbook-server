
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
import { fulfillCheckoutSession } from "./fulfill.js";

// Mounted at /api/payments
// Payments are saved through fulfillCheckoutSession.
// Both Stripe webhook and session-status can safely call it.

const router = Router();

// POST /api/payments/create-checkout-session
// Customer can pay only their own confirmed, unpaid appointment.
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

    // Reuse an existing open checkout session.
    if (appointment.checkoutSessionId) {
      const old = await stripe.checkout.sessions
        .retrieve(appointment.checkoutSessionId)
        .catch(() => null);

      // Stripe already received the payment.
      if (old?.payment_status === "paid") {
        await fulfillCheckoutSession(old);

        throw new ApiError(
          409,
          "Your payment was received. This appointment is now marked as paid."
        );
      }

      if (old?.status === "open" && old.url) {
        return sendSuccess(
          res,
          { url: old.url },
          "Checkout session ready"
        );
      }
    }

    // Calculate the payment amount using the database price.
    const unitAmount = Math.round(
      appointment.servicePrice *
      env.BDT_TO_USD_RATE *
      100
    );

    if (unitAmount < 50) {
      throw new ApiError(
        400,
        "This amount is below the minimum card payment"
      );
    }

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

      metadata: {
        appointmentId,
        userId: req.user.id,
      },

      success_url: `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url: `${env.CLIENT_URL}/payment/cancel?appointment_id=${appointmentId}`,
    });

    await appointmentsCollection.updateOne(
      { _id },
      {
        $set: {
          checkoutSessionId: session.id,
          updatedAt: new Date(),
        },
      }
    );

    return sendSuccess(
      res,
      { url: session.url },
      "Checkout session created",
      201
    );
  }
);

// GET /api/payments/session-status?session_id=cs_test_...
// Customer or admin can check payment status.
router.get(
  "/session-status",
  verifyJWT,
  validate(sessionStatusQuerySchema, "query"),
  async (req, res) => {
    // Step 1: Verify payment directly with Stripe.
    const session = await stripe.checkout.sessions
      .retrieve(req.valid.query.session_id)
      .catch(() => null);

    if (!session) {
      throw new ApiError(404, "Payment session not found");
    }

    const { appointmentId, userId } = session.metadata ?? {};

    // Step 2: Only the payment owner or admin can access it.
    if (
      userId !== req.user.id &&
      req.user.role !== "admin"
    ) {
      throw new ApiError(
        403,
        "Forbidden: this payment belongs to another account"
      );
    }

    // Step 3: Save payment after Stripe confirms payment.
    if (session.payment_status === "paid") {
      await fulfillCheckoutSession(session);
    }

    // Step 4: Fetch saved transaction and appointment status.
    const [transaction, appointment] = await Promise.all([
      transactionsCollection.findOne(
        { stripeSessionId: session.id },
        {
          projection: {
            _id: 1,
          },
        }
      ),

      appointmentId
        ? appointmentsCollection.findOne(
            {
              _id: toObjectId(appointmentId),
            },
            {
              projection: {
                paymentStatus: 1,
              },
            }
          )
        : null,
    ]);

    return sendSuccess(
      res,
      {
        sessionStatus: session.status,
        paymentStatus: session.payment_status,
        appointmentId: appointmentId ?? null,
        amount: (session.amount_total ?? 0) / 100,
        currency: session.currency,
        recorded: Boolean(transaction),
        appointmentPaymentStatus:
          appointment?.paymentStatus ?? "unpaid",
      },
      "Session status fetched"
    );
  }
);

// GET /api/payments/transactions
// Admin only: fetch payment transactions.
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
      buildMeta(page, limit, total)
    );
  }
);

export default router;

