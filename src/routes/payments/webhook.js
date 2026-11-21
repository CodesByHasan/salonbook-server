import { ObjectId } from "mongodb";
import { appointmentsCollection, paymentsCollection } from "../../config/db.js";
import { env } from "../../config/env.js";
import { stripe } from "../../config/stripe.js";

// Saves the payment and marks the appointment paid.
async function fulfill(session) {
  if (session.payment_status !== "paid") return;

  const { appointmentId } = session.metadata ?? {};
  if (!appointmentId || !ObjectId.isValid(appointmentId)) {
    console.warn("Stripe webhook: session has no valid appointmentId", session.id);
    return;
  }

  const _id = new ObjectId(appointmentId);
  const appointment = await appointmentsCollection.findOne({ _id });
  if (!appointment) {
    console.warn("Stripe webhook: appointment not found", appointmentId);
    return;
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
}

// POST /api/webhooks/stripe (mounted in app.js with express.raw)
export async function stripeWebhook(req, res) {
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.error("Stripe webhook verification failed:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfill(event.data.object);
        break;
      default:
        break;
    }
  } catch (error) {
    // 500 makes Stripe retry the event later.
    console.error("Stripe webhook handling failed:", error);
    return res.status(500).json({ received: false });
  }

  // step-3: acknowledge receipt.
  res.json({ received: true });
}