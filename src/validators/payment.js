import { z } from "zod";
import { objectIdString, paginationShape } from "./common.js";

export const createCheckoutSessionSchema = z.strictObject({
  appointmentId: objectIdString,
});

export const sessionStatusQuerySchema = z.object({
  session_id: z.string().trim().regex(/^cs_(test|live)_[A-Za-z0-9_]+$/, "Invalid session id"),
});

export const transactionsQuerySchema = z.object({
  status: z.enum(["paid", "failed"]).optional().catch(undefined),
  ...paginationShape,
});