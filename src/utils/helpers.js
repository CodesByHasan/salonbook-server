import { ObjectId } from "mongodb";
import { ApiError } from "./ApiError.js";

// Makes user text safe to put inside a RegExp ("a.b(" -> "a\.b\(").
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Converts a route param to an ObjectId. A bad id cannot match anything, so it is a 404.
export function toObjectId(id, message = "Resource not found") {
  if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) {
    throw new ApiError(404, message);
  }
  return new ObjectId(id);
}

export const getSkip = (page, limit) => (page - 1) * limit;

export const buildMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

// Turns "2026-12-01" + "14:30" into the real moment in Asia/Dhaka.
export const dhakaDateTime = (date, time) => new Date(`${date}T${time}:00+06:00`);