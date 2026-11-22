import { ObjectId } from "mongodb";
import { appointmentsCollection, transactionsCollection } from "../../config/db.js";
import { env } from "../../config/env.js";
import { stripe } from "../../config/stripe.js";

// Saves the transaction and marks the appointment paid.

export async function markAsPaid(session) {
  const appointmentId = session.metadata?.appointmentId;

  if (typeof appointmentId !== "string" || !/^[a-f\d]{24}$/i.test(appointmentId)) {
    console.log("Stripe webhook: no valid appointmentId in metadata", session.id);
    return;
  }

  const _id = new ObjectId(appointmentId);
  const appointment = await appointmentsCollection.findOne({ _id });

  if (!appointment) {
    console.log("Stripe webhook: appointment not found", appointmentId);
    return;
  }

  const now = new Date();

  // Step-1: save the transaction (one per Stripe session).
  try {
    await transactionsCollection.updateOne(
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
    if (error?.code !== 11000) throw error;
  }

  await appointmentsCollection.updateOne(
    { _id, paymentStatus: { $ne: "paid" } },
    { $set: { paymentStatus: "paid", stripeSessionId: session.id, paidAt: now, updatedAt: now } },
  );
}

// POST /api/webhooks/stripe (mounted in app.js with express.raw)
export async function stripeWebhook(req, res) {
  // req.body must be the raw Buffer, otherwise the signature check cannot work.
  if (!Buffer.isBuffer(req.body)) {
    console.log("Stripe webhook: body is not raw. Another middleware parsed it first.");
    return res.status(400).send("Webhook Error: raw body required");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (e) {
    console.log("Stripe webhook verification failed:", e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  console.log("Stripe event received:", event.type);


  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    if (session.payment_status === "paid") await markAsPaid(session);
  }


  res.json({ received: true });
}
