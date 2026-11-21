import { z } from "zod";

// ?page=2&limit=12 (bad values fall back to the defaults)
export const paginationShape = {
  page: z.coerce.number().int().min(1).catch(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).catch(12).default(12),
};

// Only http/https links (blocks javascript: and similar).
export const imageUrl = z.url({ protocol: /^https?$/ });

export const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");