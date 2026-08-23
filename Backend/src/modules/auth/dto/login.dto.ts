import type { AuthenticatedProfile, SafeUser } from "../../../shared/types/auth.types.js";

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface LoginSuccessDto {
  requiresPasswordChange: false;
  token: string;
  refreshToken: string;
  user: SafeUser;
}

/**
 * Returned instead of LoginSuccessDto when forcePasswordChange is true — no
 * token/refreshToken are issued, so the client cannot reach anything behind
 * `authenticate` until POST /auth/change-first-password succeeds.
 */
export interface LoginRequiresPasswordChangeDto {
  requiresPasswordChange: true;
  email: string;
}

export type LoginResponseDto = LoginSuccessDto | LoginRequiresPasswordChangeDto;

export type MeResponseDto = AuthenticatedProfile;

export interface RefreshTokenResponseDto {
  token: string;
  refreshToken: string;
}

/**
 * Read-only projection of AuthAuditLog — deliberately mirrors only the
 * columns that actually exist on the model (see schema.prisma). There is no
 * metadata/secret-bearing field on this table today, so no redaction logic
 * is needed here; if a future column is ever added, sanitize it here before
 * it reaches this DTO.
 */
export interface AuditLogEntryDto {
  id: string;
  occurredAt: string;
  event: string;
  email: string;
  userId: string | null;
  userFullName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditLogListDto {
  items: AuditLogEntryDto[];
  total: number;
  page: number;
  pageSize: number;
}
