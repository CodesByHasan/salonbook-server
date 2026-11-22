import { z } from "zod";
import {
  objectIdString,
  paginationShape,
} from "./common.js";

// Validate both the YYYY-MM-DD format and the actual calendar date.
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine(
    (value) => {
      const timestamp = Date.parse(`${value}T00:00:00.000Z`);

      if (!Number.isFinite(timestamp)) return false;

      return new Date(timestamp).toISOString().slice(0, 10) === value;
    },
    "Invalid calendar date",
  );

const timeSlot = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    "Time slot must be HH:mm (24-hour)",
  );

export const createAppointmentSchema = z.strictObject({
  serviceId: objectIdString,
  date,
  timeSlot,
  notes: z.string().trim().max(300).optional(),
});

const status = z
  .enum(["pending", "confirmed", "cancelled"])
  .optional()
  .catch(undefined);

export const myAppointmentsQuerySchema = z.object({
  status,
});

export const adminAppointmentsQuerySchema = z.object({
  status,
  date: date.optional().catch(undefined),
  ...paginationShape,
});