/**
 * The claims stored inside the JWT access token. Deliberately minimal —
 * anything else needed at request time (module/region/approval access,
 * profile fields) is re-read fresh from the database in
 * `authenticate.ts`/`GET /auth/me`, so a permission change takes effect
 * immediately instead of waiting for the token to expire.
 */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  roleId: string;
  roleName: string;
}

/**
 * A PortalUser shape that is safe to send to the client — never includes
 * passwordHash. Built explicitly in the repository/service layer rather
 * than by deleting a field off the Prisma result, so a future field added
 * to PortalUser can't leak by accident.
 */
export interface SafeUser {
  id: string;
  employeeCode: string | null;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  department: string | null;
  designation: string | null;
  employeeType: string | null;
  reportingManagerId: string | null;
  role: {
    id: string;
    name: string;
  };
  isActive: boolean;
  forcePasswordChange: boolean;
  accountLocked: boolean;
  passwordResetAt: Date | null;
  passwordExpiresAt: Date | null;
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `GET /auth/me` additionally returns the caller's own effective access
 * grants, since the frontend's Settings > User Management screens (and
 * later, route guards) need this to decide what to render/allow.
 */
export interface AuthenticatedProfile extends SafeUser {
  modules: string[];
  regions: string[];
  approvals: string[];
  reportingManager: { id: string; fullName: string } | null;
}

/**
 * Request metadata threaded from controller → service purely so audit-log
 * rows can record where a security event came from. Never used for any
 * access decision.
 */
export interface AuthEventContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}
