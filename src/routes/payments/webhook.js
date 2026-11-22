import { env } from "../../config/env.js";
import { stripe } from "../../config/stripe.js";
import { fulfillCheckoutSession } from "./fulfill.js";

// POST /api/webhooks/stripe
export async function stripeWebhook(req, res) {
  let event;

  // Step 1: Verify Stripe signature.
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Stripe signature verification failed:", error.message);

    return res.status(400).json({
      success: false,
      message: "Invalid Stripe webhook signature",
    });
  }

  console.log("Stripe event received:", event.type);

  // Step 2: Process successful payments.
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;

        if (session.payment_status === "paid") {
          const result = await fulfillCheckoutSession(session);

          if (!result) {
            throw new Error("Payment fulfillment was not completed");
          }
        }

        break;
      }

      default:
        console.log("Stripe event ignored:", event.type);
    }

    // Step 3: Acknowledge only after successful processing.
    return res.status(200).json({
      success: true,
      received: true,
    });
  } catch (error) {
    console.error("Stripe webhook fulfillment failed:", error);

    // Stripe retries failed webhook deliveries.
    return res.status(500).json({
      success: false,
      received: false,
      message: "Payment fulfillment failed",
    });
  }
}
