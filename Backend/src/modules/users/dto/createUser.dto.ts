export interface CreateUserRequestDto {
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  department?: string | null;
  designation?: string | null;
  reportingManagerId?: string | null;
  employeeType?: string | null;
  isActive?: boolean;

  temporaryPassword: string;
  forcePasswordChange?: boolean;

  roleId: string;

  moduleIds: string[];
  regionIds: string[];
  approvalIds: string[];
}

/**
 * What POST /users returns — a PortalUser shape safe to send to the
 * client (no passwordHash), matching the same "never leak the hash"
 * convention as Auth's SafeUser, kept as its own type here rather than
 * imported from the auth module so the two modules stay decoupled.
 */
export interface CreatedUserDto {
  id: string;
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
  createdAt: Date;
}

export interface LookupItem {
  id: string;
  name: string;
}

/**
 * Reference data the Add User form needs to turn its role/module/region/
 * approval selections into real database UUIDs before submitting — without
 * this, the frontend would have nothing but hardcoded display names to send.
 */
export interface UserLookupsDto {
  roles: LookupItem[];
  modules: LookupItem[];
  regions: LookupItem[];
  approvalTypes: LookupItem[];
}
