import { env } from "../../config/env.js";
import { stripe } from "../../config/stripe.js";
import { fulfillCheckoutSession } from "./fulfill.js";

// POST /api/webhooks/stripe (mounted in app.js with express.raw)
export async function stripeWebhook(req, res) {
  // req.body must be the raw Buffer, otherwise the signature check cannot work.
  if (!Buffer.isBuffer(req.body)) {
    console.log("Stripe webhook: body is not raw. Another middleware parsed it first.");
    return res.status(400).send("Webhook Error: raw body required");
  }

  // Step-1: verify the signature so only genuine Stripe events are accepted.
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

  // Step-2: save the payment. An error here returns 500, so Stripe retries later.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    await fulfillCheckoutSession(event.data.object);
  }

  // Step-3: acknowledge receipt. Without a response Stripe times out and retries.
  res.json({ received: true });
}