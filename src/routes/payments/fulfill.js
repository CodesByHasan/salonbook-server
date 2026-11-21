import { ObjectId } from "mongodb";
import { appointmentsCollection, paymentsCollection } from "../../config/db.js";

// Saves the transaction and marks the appointment paid.
// Used by the Stripe webhook AND by /session-status. Safe to call many times for the same session.
export async function fulfillCheckoutSession(session) {
  if (session.payment_status !== "paid") return false;

  const { appointmentId } = session.metadata ?? {};
  if (!appointmentId || !ObjectId.isValid(appointmentId)) {
    console.warn("Stripe fulfill: session has no valid appointmentId", session.id);
    return false;
  }

  const _id = new ObjectId(appointmentId);
  const appointment = await appointmentsCollection.findOne({ _id });
  if (!appointment) {
    console.warn("Stripe fulfill: appointment not found", appointmentId);
    return false;
  }

  const now = new Date();

  try {
    await paymentsCollection.updateOne(
      { stripeSessionId: session.id },
      {
        $setOnInsert: {
          paymentIntentId: session.payment_intent ?? null,
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
  } catch (error) {
    // A parallel delivery inserted it first: fine.
    if (error?.code !== 11000) throw error;
  }

  await appointmentsCollection.updateOne(
    { _id, paymentStatus: { $ne: "paid" } },
    { $set: { paymentStatus: "paid", paidAt: now, stripeSessionId: session.id, updatedAt: now } },
  );

  return true;
}