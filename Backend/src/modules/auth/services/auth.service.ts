import type { AuthenticatedProfile, AuthEventContext, SafeUser } from "../../../shared/types/auth.types.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { addDays, addMinutes } from "../../../shared/utils/date.util.js";
import { env } from "../../../shared/utils/env.js";
import { signAccessToken } from "../../../shared/utils/jwt.util.js";
import { comparePassword, hashPassword } from "../../../shared/utils/password.util.js";
import { generateOpaqueToken, hashToken } from "../../../shared/utils/token.util.js";
import { sendEmail } from "../../../shared/email/email.service.js";
import { buildForgotPasswordEmail } from "../../../shared/email/templates/forgotPassword.template.js";
import { buildResetSuccessEmail } from "../../../shared/email/templates/resetSuccess.template.js";
import type {
  ChangeFirstPasswordInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ListAuditLogsQuery,
  LoginInput,
  ResetPasswordInput,
} from "../validators/auth.validators.js";
import {
  createAuditLog,
  createPasswordResetToken,
  createRefreshToken,
  findAuditLogsPage,
  findPasswordResetTokenByHash,
  findRefreshTokenByHash,
  findUserAccessById,
  findUserByEmail,
  findUserById,
  incrementFailedLoginAttempts,
  lockAccount,
  markPasswordResetTokenUsed,
  resetFailedLoginAttempts,
  revokeAllRefreshTokensForUser,
  revokeRefreshTokenByHash,
  rotateRefreshToken,
  setForcePasswordChange,
  setNewPassword,
  updateLastLogin,
} from "../repository/auth.repository.js";
import type { AuditLogListDto, LoginResponseDto, LoginSuccessDto, RefreshTokenResponseDto } from "../dto/login.dto.js";

function toSafeUser(user: NonNullable<Awaited<ReturnType<typeof findUserByEmail>>>): SafeUser {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    department: user.department,
    designation: user.designation,
    employeeType: user.employeeType,
    reportingManagerId: user.reportingManagerId,
    role: { id: user.role.id, name: user.role.name },
    isActive: user.isActive,
    forcePasswordChange: user.forcePasswordChange,
    accountLocked: user.accountLocked,
    passwordResetAt: user.passwordResetAt,
    passwordExpiresAt: user.passwordExpiresAt,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Audit logging must never be able to break a login/password/token flow —
 * a write failure here is logged locally and swallowed, not thrown.
 */
async function logAuthEvent(
  entry: { userId?: string | null; email: string; event: string },
  context: AuthEventContext
): Promise<void> {
  try {
    await createAuditLog({ ...entry, ipAddress: context.ipAddress, userAgent: context.userAgent });
  } catch (error) {
    console.error("Failed to write auth audit log:", error);
  }
}

async function issueRefreshToken(userId: string): Promise<string> {
  const plaintext = generateOpaqueToken();
  const expiresAt = addDays(new Date(), env.REFRESH_TOKEN_EXPIRES_IN_DAYS);
  await createRefreshToken(userId, hashToken(plaintext), expiresAt);
  return plaintext;
}

/**
 * Best-effort notification sent after a password has already been changed
 * (self-service, forced-first-login, or forgot-password reset) — like
 * every other email in this app, its failure must never surface as an
 * error to a request whose underlying password change already succeeded.
 */
async function sendPasswordChangedEmail(email: string, fullName: string): Promise<void> {
  try {
    const content = buildResetSuccessEmail({ fullName, changedAtIso: new Date().toISOString() });
    const result = await sendEmail({ to: email, subject: content.subject, html: content.html });
    if (!result.success) {
      console.error(`[auth] Reset Success email failed for ${email}: ${result.error}`);
    }
  } catch (error) {
    console.error(
      `[auth] Unexpected error while sending Reset Success email for ${email}:`,
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Login is intentionally generic on failure ("Invalid email or password.")
 * whether the email doesn't exist or the password is wrong — never reveal
 * which one, or the endpoint becomes an account-enumeration tool.
 */
export async function login(input: LoginInput, context: AuthEventContext): Promise<LoginResponseDto> {
  const user = await findUserByEmail(input.email);

  if (!user) {
    await logAuthEvent({ email: input.email, event: "LOGIN_FAILED_UNKNOWN_EMAIL" }, context);
    throw new AppError("Invalid email or password.", 401);
  }

  if (user.accountLocked) {
    await logAuthEvent({ userId: user.id, email: user.email, event: "LOGIN_BLOCKED_ACCOUNT_LOCKED" }, context);
    throw new AppError("Your account is locked. Please contact your administrator.", 403);
  }

  if (!user.isActive) {
    await logAuthEvent({ userId: user.id, email: user.email, event: "LOGIN_BLOCKED_INACTIVE" }, context);
    throw new AppError("Your account is inactive. Please contact your administrator.", 403);
  }

  const passwordMatches = await comparePassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    const attempts = await incrementFailedLoginAttempts(user.id);
    await logAuthEvent({ userId: user.id, email: user.email, event: "LOGIN_FAILED_BAD_PASSWORD" }, context);

    if (attempts >= env.MAX_FAILED_LOGIN_ATTEMPTS) {
      await lockAccount(user.id);
      await logAuthEvent({ userId: user.id, email: user.email, event: "ACCOUNT_LOCKED_TOO_MANY_ATTEMPTS" }, context);
      throw new AppError(
        "Your account has been locked due to too many failed login attempts. Please contact your administrator.",
        403
      );
    }

    throw new AppError("Invalid email or password.", 401);
  }

  await resetFailedLoginAttempts(user.id);
  await updateLastLogin(user.id, new Date());

  const passwordExpired = user.passwordExpiresAt !== null && user.passwordExpiresAt.getTime() < Date.now();
  let forcePasswordChange = user.forcePasswordChange;

  if (passwordExpired && !forcePasswordChange) {
    await setForcePasswordChange(user.id, true);
    forcePasswordChange = true;
  }

  if (forcePasswordChange) {
    await logAuthEvent({ userId: user.id, email: user.email, event: "LOGIN_REQUIRES_PASSWORD_CHANGE" }, context);
    return { requiresPasswordChange: true, email: user.email };
  }

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    roleId: user.roleId,
    roleName: user.role.name,
  });
  const refreshToken = await issueRefreshToken(user.id);

  await logAuthEvent({ userId: user.id, email: user.email, event: "LOGIN_SUCCESS" }, context);

  return {
    requiresPasswordChange: false,
    token,
    refreshToken,
    user: { ...toSafeUser(user), forcePasswordChange },
  };
}

/**
 * The forced-first-login counterpart to changePassword() — used when the
 * client has no JWT yet (login() withheld one because forcePasswordChange
 * was true), so the caller is re-identified by email + current password
 * instead of an auth token. On success, behaves exactly like a fresh login:
 * a normal JWT + refresh token are issued and returned.
 */
export async function changeFirstPassword(
  input: ChangeFirstPasswordInput,
  context: AuthEventContext
): Promise<LoginSuccessDto> {
  const user = await findUserByEmail(input.email);

  if (!user) {
    throw new AppError("Invalid email or current password.", 401);
  }

  if (!user.forcePasswordChange) {
    throw new AppError("Password change is not required for this account. Please log in normally.", 400);
  }

  const currentPasswordMatches = await comparePassword(input.currentPassword, user.passwordHash);

  if (!currentPasswordMatches) {
    await logAuthEvent({ userId: user.id, email: user.email, event: "FIRST_PASSWORD_CHANGE_FAILED_BAD_CURRENT" }, context);
    throw new AppError("Invalid email or current password.", 401);
  }

  if (input.newPassword === input.currentPassword) {
    throw new AppError("New password must be different from your current password.", 400);
  }

  const passwordHash = await hashPassword(input.newPassword);
  const passwordExpiresAt = addDays(new Date(), env.PASSWORD_EXPIRY_DAYS);

  await setNewPassword(user.id, passwordHash, passwordExpiresAt);
  await revokeAllRefreshTokensForUser(user.id);
  await logAuthEvent({ userId: user.id, email: user.email, event: "FIRST_PASSWORD_CHANGE_COMPLETED" }, context);

  await sendPasswordChangedEmail(user.email, user.fullName);

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    roleId: user.roleId,
    roleName: user.role.name,
  });
  const refreshToken = await issueRefreshToken(user.id);

  await logAuthEvent({ userId: user.id, email: user.email, event: "LOGIN_SUCCESS" }, context);

  return {
    requiresPasswordChange: false,
    token,
    refreshToken,
    user: { ...toSafeUser(user), forcePasswordChange: false },
  };
}

export async function getProfile(userId: string): Promise<AuthenticatedProfile> {
  const user = await findUserAccessById(userId);

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  return {
    ...toSafeUser(user),
    modules: user.moduleAccess.map((grant) => grant.module.name),
    regions: user.regionAccess.map((grant) => grant.region.name),
    approvals: user.approvalPermissions.map((grant) => grant.approvalType.name),
    reportingManager: user.reportingManager
      ? { id: user.reportingManager.id, fullName: user.reportingManager.fullName }
      : null,
  };
}

export async function logout(userId: string, refreshTokenPlaintext: string | undefined, context: AuthEventContext): Promise<void> {
  if (refreshTokenPlaintext) {
    await revokeRefreshTokenByHash(hashToken(refreshTokenPlaintext));
  }

  const user = await findUserById(userId);
  await logAuthEvent({ userId, email: user?.email ?? "unknown", event: "LOGOUT" }, context);
}

/**
 * Refresh tokens rotate on every use: the presented token is revoked and a
 * new one issued in the same transaction, so a leaked-and-replayed old
 * token fails immediately after the legitimate client has moved on to the
 * new one.
 */
export async function refreshAccessToken(refreshTokenPlaintext: string, context: AuthEventContext): Promise<RefreshTokenResponseDto> {
  const stored = await findRefreshTokenByHash(hashToken(refreshTokenPlaintext));

  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    throw new AppError("Invalid or expired refresh token. Please log in again.", 401);
  }

  const newPlaintext = generateOpaqueToken();
  const newExpiresAt = addDays(new Date(), env.REFRESH_TOKEN_EXPIRES_IN_DAYS);
  await rotateRefreshToken(stored.id, stored.userId, hashToken(newPlaintext), newExpiresAt);

  const token = signAccessToken({
    sub: stored.user.id,
    email: stored.user.email,
    roleId: stored.user.roleId,
    roleName: stored.user.role.name,
  });

  await logAuthEvent({ userId: stored.user.id, email: stored.user.email, event: "TOKEN_REFRESHED" }, context);

  return { token, refreshToken: newPlaintext };
}

export async function changePassword(userId: string, input: ChangePasswordInput, context: AuthEventContext): Promise<void> {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  const currentPasswordMatches = await comparePassword(input.currentPassword, user.passwordHash);

  if (!currentPasswordMatches) {
    await logAuthEvent({ userId: user.id, email: user.email, event: "CHANGE_PASSWORD_FAILED_BAD_CURRENT" }, context);
    throw new AppError("Current password is incorrect.", 401);
  }

  if (input.newPassword === input.currentPassword) {
    throw new AppError("New password must be different from your current password.", 400);
  }

  const passwordHash = await hashPassword(input.newPassword);
  const passwordExpiresAt = addDays(new Date(), env.PASSWORD_EXPIRY_DAYS);

  await setNewPassword(user.id, passwordHash, passwordExpiresAt);
  await revokeAllRefreshTokensForUser(user.id);
  await logAuthEvent({ userId: user.id, email: user.email, event: "PASSWORD_CHANGED" }, context);

  await sendPasswordChangedEmail(user.email, user.fullName);
}

/**
 * Always resolves the same way regardless of whether the email exists —
 * the controller sends one generic message either way, so this endpoint
 * can't be used to enumerate registered emails.
 */
export async function forgotPassword(input: ForgotPasswordInput, context: AuthEventContext): Promise<void> {
  const user = await findUserByEmail(input.email);

  if (!user) {
    await logAuthEvent({ email: input.email, event: "PASSWORD_RESET_REQUESTED_UNKNOWN_EMAIL" }, context);
    return;
  }

  const plaintext = generateOpaqueToken(32);
  const expiresAt = addMinutes(new Date(), env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES);
  await createPasswordResetToken(user.id, hashToken(plaintext), expiresAt);
  await logAuthEvent({ userId: user.id, email: user.email, event: "PASSWORD_RESET_REQUESTED" }, context);

  try {
    const resetUrl = `${env.FRONTEND_URL}/auth/reset-password?token=${plaintext}`;
    const content = buildForgotPasswordEmail({
      fullName: user.fullName,
      resetUrl,
      expiresInMinutes: env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
    });

    const result = await sendEmail({ to: user.email, subject: content.subject, html: content.html });
    if (!result.success) {
      console.error(`[auth] Forgot Password email failed for ${user.email}: ${result.error}`);
    }
  } catch (error) {
    console.error(
      `[auth] Unexpected error while sending Forgot Password email for ${user.email}:`,
      error instanceof Error ? error.message : error
    );
  }
}

export async function resetPassword(input: ResetPasswordInput, context: AuthEventContext): Promise<void> {
  const stored = await findPasswordResetTokenByHash(hashToken(input.token));

  if (!stored || stored.usedAt || stored.expiresAt.getTime() < Date.now()) {
    throw new AppError("This password reset link is invalid or has expired.", 400);
  }

  const passwordHash = await hashPassword(input.newPassword);
  const passwordExpiresAt = addDays(new Date(), env.PASSWORD_EXPIRY_DAYS);

  await setNewPassword(stored.userId, passwordHash, passwordExpiresAt);
  await markPasswordResetTokenUsed(stored.id);
  await revokeAllRefreshTokensForUser(stored.userId);
  await logAuthEvent({ userId: stored.userId, email: stored.user.email, event: "PASSWORD_RESET_COMPLETED" }, context);

  await sendPasswordChangedEmail(stored.user.email, stored.user.fullName);
}

/**
 * Checks a reset token's hash exists, is unused, and unexpired WITHOUT
 * consuming it — used by the Reset Password page to validate the link on
 * load, before it shows the New Password form.
 */
export async function validateResetToken(token: string): Promise<{ valid: boolean }> {
  if (!token) {
    return { valid: false };
  }

  const stored = await findPasswordResetTokenByHash(hashToken(token));
  const valid = !!stored && !stored.usedAt && stored.expiresAt.getTime() > Date.now();
  return { valid };
}

/**
 * Administrator-only read side of AuthAuditLog (route-gated). Maps directly
 * to AuditLogEntryDto — no field on the model needs redaction (see the
 * model's own field list; there is no metadata/secret column), so this is a
 * plain projection, not a sanitizer.
 */
export async function listAuditLogs(query: ListAuditLogsQuery): Promise<AuditLogListDto> {
  const { page, pageSize } = query;
  const { items, total } = await findAuditLogsPage(page, pageSize);

  return {
    items: items.map((row) => ({
      id: row.id,
      occurredAt: row.createdAt.toISOString(),
      event: row.event,
      email: row.email,
      userId: row.userId,
      userFullName: row.user?.fullName ?? null,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
    })),
    total,
    page,
    pageSize,
  };
}
