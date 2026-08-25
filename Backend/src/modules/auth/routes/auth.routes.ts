import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { forgotPasswordRateLimit, loginRateLimit, resetTokenRateLimit } from "../../../shared/middleware/authRateLimit.js";
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

// P1 — per-IP rate limiting on every unauthenticated Auth endpoint (see
// authRateLimit.ts's own comment for exactly what this does and does not
// protect against, and how it relates to the pre-existing per-account
// failed-login lock, which is unchanged). Placed before validate() so an
// abusive caller is throttled before the body is even parsed/validated.
router.post("/login", loginRateLimit, validate(loginSchema), login);
router.post("/refresh-token", validate(refreshTokenSchema), refreshToken);
router.post("/logout", authenticate, logout);
router.get("/me", authenticate, me);

router.post("/change-password", authenticate, validate(changePasswordSchema), changePassword);
// No JWT exists yet at this point — forcePasswordChange login withheld one.
router.post("/change-first-password", loginRateLimit, validate(changeFirstPasswordSchema), changeFirstPassword);

router.post("/forgot-password", forgotPasswordRateLimit, validate(forgotPasswordSchema), forgotPassword);
router.get("/validate-reset-token", resetTokenRateLimit, validateResetToken);
router.post("/reset-password", resetTokenRateLimit, validate(resetPasswordSchema), resetPassword);

// Read-only, Administrator-only view of AuthAuditLog — no write route exists
// or is intended; audit rows are only ever created internally by
// auth.service.ts's logAuthEvent().
router.get("/audit-logs", authenticate, authorize("Administrator"), getAuditLogs);

export default router;
