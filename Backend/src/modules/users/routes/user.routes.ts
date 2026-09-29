import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  createUser,
  deleteUser,
  getLookups,
  getUsers,
  getUsersByRole,
  resetPassword,
  updateUser,
} from "../controllers/user.controller.js";
import { createUserSchema, updateUserSchema } from "../validators/user.validators.js";

const router = Router();

// Reference data (role/module/region/approval names + ids) the Add User
// form needs to populate its selectors — any authenticated user with
// access to Settings can load it.
router.get("/lookups", authenticate, getLookups);

// PR Request & Two-Level Approval Workflow — deliberately NOT gated by
// authorize("Administrator", "PMO Manager") like GET / below: a "PR Request
// User" holds no Users module access at all and must still be able to
// populate the Request-PR form's "Assigned PMO Manager" dropdown. Safe
// precisely because getUsersByRole()/findActiveUsersByRoleName() return only
// {id, fullName} for active users of the requested role — never role/module/
// region/approval grants, unlike GET / below. Registered before "/" so it
// can never be confused with it (distinct literal path, no :id segment).
router.get("/by-role", authenticate, getUsersByRole);

// The User Directory listing — same two roles as Create User/Reset
// Password, since it exposes every account's role and permission grants.
router.get("/", authenticate, authorize("Administrator", "PMO Manager"), getUsers);

// Only Administrator/PMO Manager can provision new portal logins — the
// same two roles the frontend's User Management screen is meant for.
// denyReadOnlyWrites is belt-and-suspenders (authorize already excludes Read Only).
router.post(
  "/",
  authenticate,
  denyReadOnlyWrites,
  authorize("Administrator", "PMO Manager"),
  validate(createUserSchema),
  createUser
);

// Edit User Profile — profile fields, role, and module/region/approval
// permission grants. Password changes are out of scope here (see Auth's
// endpoints and the admin-reset route below).
router.patch(
  "/:id",
  authenticate,
  denyReadOnlyWrites,
  authorize("Administrator", "PMO Manager"),
  validate(updateUserSchema),
  updateUser
);

// Admin-initiated reset — sets the account back to the configured default
// temporary password and forces a change on next login.
router.post(
  "/:id/reset-password",
  authenticate,
  denyReadOnlyWrites,
  authorize("Administrator", "PMO Manager"),
  resetPassword
);

// Permanent delete — self-delete is blocked in the service layer.
router.delete(
  "/:id",
  authenticate,
  denyReadOnlyWrites,
  authorize("Administrator", "PMO Manager"),
  deleteUser
);

export default router;
