import { Router } from "express";
import multer from "multer";
import { env } from "../../config/env.js";
import { verifyJWT } from "../../middleware/auth.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

// Mounted at /api/upload
// POST multipart/form-data with one file in the field "image".

const router = Router();


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new ApiError(400, "Only image files are allowed"));
  },
});

router.post("/", verifyJWT, upload.single("image"), async (req, res) => {
  if (!env.IMGBB_API_KEY) throw new ApiError(503, "Image upload is not configured");
  if (!req.file) throw new ApiError(400, 'Image file is required (form field name: "image")');

  const form = new FormData();
  form.append("image", req.file.buffer.toString("base64"));

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${env.IMGBB_API_KEY}`, {
    method: "POST",
    body: form,
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.success) {
    throw new ApiError(502, "Image upload failed. Please try again.");
  }

  sendSuccess(res, { url: result.data.display_url ?? result.data.url }, "Image uploaded successfully", 201);
});

export default router;