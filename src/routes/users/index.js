import { Router } from "express";
import { usersCollection } from "../../config/db.js";
import { verifyJWT, requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { buildMeta, escapeRegex, getSkip, toObjectId } from "../../utils/helpers.js";
import { updateMeSchema, userListQuerySchema } from "../../validators/user.js";

// Mounted at /api/users

const router = Router();

// Fields that are safe to send to the browser.
const projection = { name: 1, email: 1, image: 1, phone: 1, role: 1, isBlocked: 1, createdAt: 1 };

// GET /api/users/me: current user (also a handy "is my token working?" test).
router.get("/me", verifyJWT, async (req, res) => {
  const user = await usersCollection.findOne({ email: req.user.email }, { projection });
  sendSuccess(res, user, "Profile fetched successfully");
});

// PATCH /api/users/me: only name, image and phone are allowed (see validators/user.js).
router.patch("/me", verifyJWT, validate(updateMeSchema), async (req, res) => {
  const updated = await usersCollection.findOneAndUpdate(
    { email: req.user.email },
    { $set: { ...req.valid.body, updatedAt: new Date() } },
    { returnDocument: "after", projection },
  );

  if (!updated) throw new ApiError(404, "User not found");

  sendSuccess(res, updated, "Profile updated successfully");
});

// GET /api/users (admin): ?search=&role=&blocked=&page=&limit=
router.get("/", verifyJWT, requireRole("admin"), validate(userListQuerySchema, "query"), async (req, res) => {
  const { search, role, blocked, page, limit } = req.valid.query;
  const filter = {};

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: regex }, { email: regex }];
  }
  if (role) filter.role = role;
  if (blocked) filter.isBlocked = blocked === "true" ? true : { $ne: true };

  const [users, total] = await Promise.all([
    usersCollection.find(filter, { projection }).sort({ createdAt: -1 }).skip(getSkip(page, limit)).limit(limit).toArray(),
    usersCollection.countDocuments(filter),
  ]);

  sendSuccess(res, users, "Users fetched successfully", 200, buildMeta(page, limit, total));
});

// Shared by block / unblock.
async function setBlocked(req, res, isBlocked) {
  const _id = toObjectId(req.params.id, "User not found");

  if (req.user.id === req.params.id) throw new ApiError(400, "You cannot block or unblock yourself");

  const target = await usersCollection.findOne({ _id }, { projection: { role: 1 } });
  if (!target) throw new ApiError(404, "User not found");
  if (target.role === "admin") throw new ApiError(403, "Admin accounts cannot be blocked");

  const updated = await usersCollection.findOneAndUpdate(
    { _id },
    { $set: { isBlocked, updatedAt: new Date() } },
    { returnDocument: "after", projection },
  );

  sendSuccess(res, updated, isBlocked ? "User blocked" : "User unblocked");
}

// PATCH /api/users/:id/block and /unblock (admin)
router.patch("/:id/block", verifyJWT, requireRole("admin"), (req, res) => setBlocked(req, res, true));
router.patch("/:id/unblock", verifyJWT, requireRole("admin"), (req, res) => setBlocked(req, res, false));

export default router;