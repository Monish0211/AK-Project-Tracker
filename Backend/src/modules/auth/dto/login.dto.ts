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
