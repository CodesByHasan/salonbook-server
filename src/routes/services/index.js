import { Router } from "express";
import { servicesCollection, appointmentsCollection } from "../../config/db.js";
import { verifyJWT, requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { buildMeta, escapeRegex, getSkip, toObjectId } from "../../utils/helpers.js";
import { createServiceSchema, updateServiceSchema, serviceListQuerySchema } from "../../validators/service.js";

// Mounted at /api/services

const router = Router();

// Builds the Mongo filter / sort / paging from the validated query.
async function findServices(query, { onlyActive }) {
  const { search, category, sort, status, page, limit } = query;
  const filter = {};

  if (onlyActive) filter.status = "active";
  else if (status) filter.status = status;

  if (category) filter.category = category;

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i"); // case-insensitive
    filter.$or = [{ name: regex }, { description: regex }];
  }

  const sortBy = sort ? { price: sort === "asc" ? 1 : -1, _id: 1 } : { createdAt: -1 };

  const [items, total] = await Promise.all([
    servicesCollection.find(filter).sort(sortBy).skip(getSkip(page, limit)).limit(limit).toArray(),
    servicesCollection.countDocuments(filter),
  ]);

  return { items, meta: buildMeta(page, limit, total) };
}

// GET /api/services (public): active services only.
router.get("/", validate(serviceListQuerySchema, "query"), async (req, res) => {
  const { items, meta } = await findServices(req.valid.query, { onlyActive: true });
  sendSuccess(res, items, "Services fetched successfully", 200, meta);
});

// GET /api/services/manage (admin): all services. Must stay above "/:id".
router.get("/manage", verifyJWT, requireRole("admin"), validate(serviceListQuerySchema, "query"), async (req, res) => {
  const { items, meta } = await findServices(req.valid.query, { onlyActive: false });
  sendSuccess(res, items, "Services fetched successfully", 200, meta);
});

// GET /api/services/:id (public)
router.get("/:id", async (req, res) => {
  const service = await servicesCollection.findOne({
    _id: toObjectId(req.params.id, "Service not found"),
  });

  if (!service) throw new ApiError(404, "Service not found");

  sendSuccess(res, service, "Service fetched successfully");
});

// POST /api/services (admin)
router.post("/", verifyJWT, requireRole("admin"), validate(createServiceSchema), async (req, res) => {
  const now = new Date();
  const service = { ...req.valid.body, createdBy: req.user.email, createdAt: now, updatedAt: now };

  const result = await servicesCollection.insertOne(service);
  sendSuccess(res, { ...service, _id: result.insertedId }, "Service added successfully", 201);
});

// PATCH /api/services/:id (admin): also used to set status active/inactive.
router.patch("/:id", verifyJWT, requireRole("admin"), validate(updateServiceSchema), async (req, res) => {
  const updated = await servicesCollection.findOneAndUpdate(
    { _id: toObjectId(req.params.id, "Service not found") },
    { $set: { ...req.valid.body, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) throw new ApiError(404, "Service not found");

  sendSuccess(res, updated, "Service updated successfully");
});

// DELETE /api/services/:id (admin)
router.delete("/:id", verifyJWT, requireRole("admin"), async (req, res) => {
  const _id = toObjectId(req.params.id, "Service not found");

  // Do not delete a service that still has live appointments. Set it inactive instead.
  const live = await appointmentsCollection.countDocuments({
    serviceId: _id,
    status: { $in: ["pending", "confirmed"] },
  });

  if (live > 0) {
    throw new ApiError(409, "This service has pending or confirmed appointments. Set it to inactive instead.");
  }

  const result = await servicesCollection.deleteOne({ _id });
  if (result.deletedCount === 0) throw new ApiError(404, "Service not found");

  sendSuccess(res, null, "Service deleted successfully");
});

export default router;