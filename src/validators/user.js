import { z } from "zod";
import { imageUrl, paginationShape } from "./common.js";

// Only name, image and phone may be changed. strictObject rejects anything else
// (role, email, isBlocked ...) with a 400.
export const updateMeSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(80).optional(),
    image: imageUrl.optional(),
    phone: z
      .string()
      .trim()
      .regex(/^(?:\+?88)?01[3-9]\d{8}$/, "Enter a valid Bangladesh phone number")
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const userListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(["user", "admin"]).optional().catch(undefined),
  blocked: z.enum(["true", "false"]).optional().catch(undefined),
  ...paginationShape,
});