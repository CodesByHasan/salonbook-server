import { stripe } from "../src/config/stripe.js";
import { connectDB, closeDB } from "../src/config/db.js";
import { fulfillCheckoutSession } from "../src/routes/payments/fulfill.js";

// Usage: npm run recover:payment -- cs_test_xxxxxxxx
const sessionId = process.argv[2];

if (!sessionId) {
  console.error("Usage: npm run recover:payment -- <stripe checkout session id>");
  process.exit(1);
}

try {
  await connectDB();

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const saved = await fulfillCheckoutSession(session);

  if (!saved) throw new Error(`Nothing saved (payment status: ${session.payment_status}).`);
  console.log("Done: transaction saved and appointment marked as paid.");
} catch (error) {
  console.error("Recovery failed:", error.message);
  process.exitCode = 1;
} finally {
  await closeDB();
}