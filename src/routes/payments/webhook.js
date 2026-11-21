import { env } from "../../config/env.js";
import { stripe } from "../../config/stripe.js";
import { fulfillCheckoutSession } from "./fulfill.js";

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
        await fulfillCheckoutSession(event.data.object);
        break;
      default:
        break;
    }
  } catch (error) {
    // 500 makes Stripe retry the event later.
    console.error("Stripe webhook handling failed:", error);
    return res.status(500).json({ received: false });
  }

  // Acknowledge receipt.
  res.json({ received: true });
}