import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  changeFirstPassword,
  changePassword,
  forgotPassword,
  getAuditLogs,
  login,
  logout,
  me,
  refreshToken,
  resetPassword,
  validateResetToken,
} from "../controllers/auth.controller.js";
import {
  changeFirstPasswordSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  resetPasswordSchema,
} from "../validators/auth.validators.js";

const router = Router();

router.post("/login", validate(loginSchema), login);
router.post("/refresh-token", validate(refreshTokenSchema), refreshToken);
router.post("/logout", authenticate, logout);
router.get("/me", authenticate, me);

router.post("/change-password", authenticate, validate(changePasswordSchema), changePassword);
// No JWT exists yet at this point — forcePasswordChange login withheld one.
router.post("/change-first-password", validate(changeFirstPasswordSchema), changeFirstPassword);

router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.get("/validate-reset-token", validateResetToken);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

// Read-only, Administrator-only view of AuthAuditLog — no write route exists
// or is intended; audit rows are only ever created internally by
// auth.service.ts's logAuthEvent().
router.get("/audit-logs", authenticate, authorize("Administrator"), getAuditLogs);

export default router;
