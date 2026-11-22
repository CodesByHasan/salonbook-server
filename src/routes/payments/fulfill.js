import { ObjectId } from "mongodb";
import {
  appointmentsCollection,
  transactionsCollection,
} from "../../config/db.js";

// Called only after Stripe webhook signature verification.
export async function fulfillCheckoutSession(session) {
  if (session.payment_status !== "paid") {
    return false;
  }

  const { appointmentId, userId } = session.metadata || {};

  if (!appointmentId || !ObjectId.isValid(appointmentId)) {
    throw new Error("Invalid appointment ID in Stripe metadata");
  }

  if (!userId) {
    throw new Error("Customer ID missing from Stripe metadata");
  }

  if (session.client_reference_id &&
      session.client_reference_id !== appointmentId) {
    throw new Error("Stripe appointment reference mismatch");
  }

  const _id = new ObjectId(appointmentId);

  // Find the correct customer's appointment.
  const appointment = await appointmentsCollection.findOne({
    _id,
    userId,
  });

  if (!appointment) {
    throw new Error("Appointment not found for this Stripe session");
  }

  // Do not allow another Checkout Session to pay this appointment.
  if (
    appointment.checkoutSessionId &&
    appointment.checkoutSessionId !== session.id
  ) {
    throw new Error("Stripe Checkout Session does not match appointment");
  }

  const now = new Date();

  // Update appointment payment status.
  const appointmentResult = await appointmentsCollection.updateOne(
    {
      _id,
      userId,
      $or: [
        { checkoutSessionId: session.id },
        { checkoutSessionId: { $exists: false } },
        { checkoutSessionId: null },
      ],
    },
    {
      $set: {
        paymentStatus: "paid",
        checkoutSessionId: session.id,
        stripeSessionId: session.id,
        paidAt: appointment.paidAt || now,
        updatedAt: now,
      },
    }
  );

  if (appointmentResult.matchedCount === 0) {
    // Allow an already completed duplicate webhook.
    const existing = await appointmentsCollection.findOne({
      _id,
      userId,
      paymentStatus: "paid",
      stripeSessionId: session.id,
    });

    if (!existing) {
      throw new Error("MongoDB could not update appointment payment status");
    }
  }

  // Save one transaction per Stripe Checkout Session.
  try {
    await transactionsCollection.updateOne(
      { stripeSessionId: session.id },
      {
        $setOnInsert: {
          stripeSessionId: session.id,
          paymentIntentId: session.payment_intent || null,

          appointmentId: _id,
          userId,

          customerName: appointment.userName || "",
          customerEmail: appointment.userEmail || session.customer_details?.email || "",

          serviceId: appointment.serviceId,
          serviceName: appointment.serviceName,

          appointmentDate: appointment.date,
          appointmentTime: appointment.timeSlot,

          amount: (session.amount_total || 0) / 100,
          currency: session.currency || "usd",
          amountBdt: appointment.servicePrice,

          status: "paid",
          createdAt: now,
        },
      },
      { upsert: true }
    );
  } catch (error) {
    // A duplicate-key error means another webhook already inserted it.
    if (error.code !== 11000) {
      throw error;
    }
  }

  console.log("Payment successfully fulfilled:", {
    appointmentId,
    sessionId: session.id,
  });

  return true;
}
