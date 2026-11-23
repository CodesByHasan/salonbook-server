// Saves the transaction and marks the appointment as paid.
// Called ONLY by the verified Stripe webhook (webhook.js) and the recover script.

import { ObjectId } from "mongodb";
import { appointmentsCollection, transactionsCollection } from "../../config/db.js";


export async function fulfillCheckoutSession(session) {
  // Only a session that Stripe says is paid can be fulfilled.
  if (session.payment_status !== "paid") return false;

  const { appointmentId, userId } = session.metadata ?? {};

  if (typeof appointmentId !== "string" || !/^[a-f\d]{24}$/i.test(appointmentId)) {
    console.log("Stripe: no valid appointmentId in metadata", session.id);
    return false;
  }

  const _id = new ObjectId(appointmentId);
  const appointment = await appointmentsCollection.findOne({ _id });

  // The appointment must exist and belong to the customer who started the checkout.
  if (!appointment || appointment.customerId !== userId) {
    console.log("Stripe: appointment not found for this session", session.id);
    return false;
  }

  const now = new Date();


  try {
    await transactionsCollection.updateOne(
      { stripeSessionId: session.id },
      {
        $setOnInsert: {
          paymentIntentId: session.payment_intent ?? null,
          appointmentId: _id,
          customerId: appointment.customerId,
          customerName: appointment.userName,
          customerEmail: appointment.userEmail,
          serviceId: appointment.serviceId,
          serviceName: appointment.serviceName,
          appointmentDate: appointment.appointmentDate,
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
    // Duplicate key: another request saved it a moment ago. That is fine.
    if (error?.code !== 11000) throw error;
  }

  
  await appointmentsCollection.updateOne(
    { _id, paymentStatus: { $ne: "paid" } },
    { $set: { paymentStatus: "paid", stripeSessionId: session.id, paidAt: now, updatedAt: now } },
  );

  return true;
}
