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
  /**
   * NOT a token claim. Attached by authenticate.ts for the lifetime of one request when COUNTRY_ACCESS_MODE is not "off"
   * (grants re-read from the database, plus the validated X-Active-Country header). Never signed into the JWT.
   */
  country?: CountryContext;
}

/** One country (operating unit) as exposed to clients. */
export interface CountryRegionInfo {
  id: string;
  code: string | null;
  /** The stored region name (still "FZI" for FZE until the audited rename). */
  name: string;
  /** What a UI shows; falls back to `name`. */
  displayName: string;
  defaultCurrency: string | null;
}

/** Per-request country access context (Global Multi-Country Phase 1). See shared/utils/countryAccess.ts. */
export interface CountryContext {
  mode: "off" | "shadow" | "enforce";
  /** The explicit All Countries right. */
  allCountries: boolean;
  /** The user's assigned, still-active countries. */
  assigned: CountryRegionInfo[];
  /** What the user may select: all active countries for an All Countries holder, otherwise the assigned ones. */
  selectable: CountryRegionInfo[];
  /** The raw X-Active-Country header, or null. Validated lazily, so a stale value never blocks /auth/me. */
  requested: string | null;
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
  /** Country access (Global Multi-Country Phase 1): what this account may select, re-read from the database on every call. */
  countries: CountryRegionInfo[];
  allCountries: boolean;
  countryAccessMode: "off" | "shadow" | "enforce";
  /** False when the account has no country at all (the frontend then shows access-not-configured while enforcing). */
  countryAccessConfigured: boolean;
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
