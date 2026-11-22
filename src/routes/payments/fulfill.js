import { ObjectId } from "mongodb";
import {
  appointmentsCollection,
  transactionsCollection,
} from "../../config/db.js";

// This function must only be called after Stripe webhook signature verification.
// It is safe for Stripe to deliver the same event more than once.
export async function fulfillCheckoutSession(session) {
  if (session.payment_status !== "paid") return false;

  const { appointmentId } = session.metadata ?? {};

  if (!appointmentId || !ObjectId.isValid(appointmentId)) {
    console.warn("Stripe fulfill: invalid appointmentId", session.id);
    return false;
  }

  const _id = new ObjectId(appointmentId);

  const appointment = await appointmentsCollection.findOne({ _id });

  if (!appointment) {
    console.warn("Stripe fulfill: appointment not found", appointmentId);
    return false;
  }

  // Make sure the Stripe session belongs to this appointment.
  if (appointment.checkoutSessionId !== session.id) {
    console.warn("Stripe fulfill: session does not match appointment", session.id);
    return false;
  }

  const now = new Date();

  // Save one transaction per Stripe Checkout Session.
  await transactionsCollection.updateOne(
    { stripeSessionId: session.id },
    {
      $setOnInsert: {
        paymentIntentId: session.payment_intent ?? null,
        stripeSessionId: session.id,
        appointmentId: _id,
        userId: appointment.userId,
        customerName: appointment.userName,
        customerEmail: appointment.userEmail,
        serviceId: appointment.serviceId,
        serviceName: appointment.serviceName,
        appointmentDate: appointment.date,
        appointmentTime: appointment.timeSlot,
        amount: (session.amount_total ?? 0) / 100,
        currency: session.currency,
        amountBdt: appointment.servicePrice,
        status: "paid",
        createdAt: now,
      },
    },
    { upsert: true },
  );

  // Only the verified webhook can change this field to "paid".
  await appointmentsCollection.updateOne(
    {
      _id,
      checkoutSessionId: session.id,
      paymentStatus: { $ne: "paid" },
    },
    {
      $set: {
        paymentStatus: "paid",
        paidAt: now,
        updatedAt: now,
      },
    },
  );

  return true;
}