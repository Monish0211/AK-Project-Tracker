import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import type { AuthEventContext } from "../../../shared/types/auth.types.js";
import * as authService from "../services/auth.service.js";
import { listAuditLogsQuerySchema } from "../validators/auth.validators.js";
import type {
  ChangeFirstPasswordInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RefreshTokenInput,
  ResetPasswordInput,
} from "../validators/auth.validators.js";

function contextFrom(req: Request): AuthEventContext {
  return { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body as LoginInput, contextFrom(req));
  res.status(200).json({ success: true, data: result });
});

/**
 * The access token itself is stateless and can't be revoked early, but the
 * refresh token (if the client sends one) is — this is the one place that
 * matters: without it, a "logged out" client could still mint new access
 * tokens forever via /auth/refresh-token.
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Authentication required.", 401);
  }

  const refreshToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  await authService.logout(req.user.sub, refreshToken, contextFrom(req));
  res.status(200).json({ success: true, data: null, message: "Logged out successfully." });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Authentication required.", 401);
  }

  const profile = await authService.getProfile(req.user.sub);
  res.status(200).json({ success: true, data: profile });
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: token } = req.body as RefreshTokenInput;
  const result = await authService.refreshAccessToken(token, contextFrom(req));
  res.status(200).json({ success: true, data: result });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Authentication required.", 401);
  }

  await authService.changePassword(req.user.sub, req.body as ChangePasswordInput, contextFrom(req));
  res.status(200).json({ success: true, data: null, message: "Password changed successfully." });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.forgotPassword(req.body as ForgotPasswordInput, contextFrom(req));
  res.status(200).json({
    success: true,
    data: null,
    message: "If that email address is registered, a password reset link has been sent.",
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body as ResetPasswordInput, contextFrom(req));
  res.status(200).json({ success: true, data: null, message: "Password reset successfully. Please log in." });
});

export const validateResetToken = asyncHandler(async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const result = await authService.validateResetToken(token);
  res.status(200).json({ success: true, data: result });
});

export const changeFirstPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.changeFirstPassword(req.body as ChangeFirstPasswordInput, contextFrom(req));
  res.status(200).json({ success: true, data: result });
});

// Query params aren't covered by the shared `validate()` middleware (body
// only) — same manual-safeParse convention as employee.controller.ts's
// getEmployees.
export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const result = listAuditLogsQuerySchema.safeParse(req.query);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Invalid query parameters.";
    throw new AppError(message, 400);
  }

  const page = await authService.listAuditLogs(result.data);
  res.status(200).json({ success: true, data: page });
});
