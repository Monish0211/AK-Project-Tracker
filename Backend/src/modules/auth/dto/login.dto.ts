import type { AuthenticatedProfile, SafeUser } from "../../../shared/types/auth.types.js";

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface LoginResponseDto {
  token: string;
  refreshToken: string;
  user: SafeUser;
}

export type MeResponseDto = AuthenticatedProfile;

export interface RefreshTokenResponseDto {
  token: string;
  refreshToken: string;
}
