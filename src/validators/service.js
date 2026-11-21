import { z } from "zod";
import { imageUrl, paginationShape } from "./common.js";

const fields = {
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(10).max(1000),
  category: z.string().trim().toLowerCase().min(2).max(50),
  price: z.number().positive("Price must be greater than 0"),
  duration: z.number().int().positive("Duration must be greater than 0").max(600), // minutes
  image: imageUrl,
  status: z.enum(["active", "inactive"]),
};

// status defaults to "active". Unknown fields are rejected.
export const createServiceSchema = z.strictObject({
  ...fields,
  status: fields.status.default("active"),
});

export const updateServiceSchema = z
  .strictObject(fields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

// GET /services?search=hair&category=hair&sort=asc&page=1&limit=12
export const serviceListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().toLowerCase().max(50).optional(),
  sort: z.enum(["asc", "desc"]).optional().catch(undefined), // sorts by price
  status: z.enum(["active", "inactive"]).optional().catch(undefined), // admin list only
  ...paginationShape,
});