/**
 * What GET /users returns for every row — never includes passwordHash.
 * modules/regions/approvals are name arrays (not ids), matching the exact
 * shape Auth's GET /me already returns them in, so the frontend can reuse
 * the same boolean-flag mapping logic for both.
 */
export interface UserListItemDto {
  id: string;
  employeeCode: string | null;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  department: string | null;
  designation: string | null;
  employeeType: string | null;
  reportingManagerId: string | null;
  reportingManagerName: string | null;
  role: {
    id: string;
    name: string;
  };
  isActive: boolean;
  forcePasswordChange: boolean;
  accountLocked: boolean;
  lastLogin: Date | null;
  passwordResetAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  modules: string[];
  regions: string[];
  approvals: string[];
}
