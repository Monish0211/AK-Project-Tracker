import { z } from "zod";

/**
 * Login is ALWAYS company email + password — there is no employeeCode
 * login path, per the frontend's single email/password form.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email is required.").email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Shared by change-password and reset-password — both are "set a fresh
 * password," so they hold the new password to the same minimum policy.
 */
const newPasswordPolicy = z
  .string()
  .min(8, "Password must be at least 8 characters long.")
  .regex(/[A-Za-z]/, "Password must contain at least one letter.")
  .regex(/[0-9]/, "Password must contain at least one number.");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: newPasswordPolicy,
    confirmPassword: z.string().min(1, "Confirm password is required."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirm password do not match.",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email is required.").email("Enter a valid email address."),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required."),
    newPassword: newPasswordPolicy,
    confirmPassword: z.string().min(1, "Confirm password is required."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirm password do not match.",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Used only by the forced-first-login flow, where the client has no JWT yet
 * — the user is re-identified by email + their current (temporary) password
 * instead of an auth token. Kept fully separate from changePasswordSchema
 * (the JWT-protected self-service endpoint) rather than reused, since the
 * two endpoints authenticate the caller in different ways.
 */
export const changeFirstPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(1, "Email is required.").email("Enter a valid email address."),
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: newPasswordPolicy,
    confirmPassword: z.string().min(1, "Confirm password is required."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirm password do not match.",
    path: ["confirmPassword"],
  });

export type ChangeFirstPasswordInput = z.infer<typeof changeFirstPasswordSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required."),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
