import { Router } from "express";
import {
  verifyJWT,
  requireRole,
} from "../../middleware/auth.js";

const router = Router();

// Any authenticated user can access this route.
router.get("/me", verifyJWT, (req, res) => {
  res.json({
    success: true,
    message: "Authentication successful",
    user: req.user,
  });
});

// Only Admin users can access this route.
router.get(
  "/admin",
  verifyJWT,
  requireRole("admin"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Admin!",
      user: req.user,
    });
  }
);

export default router;