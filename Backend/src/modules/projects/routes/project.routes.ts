import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  archiveProject,
  createProject,
  getProject,
  getProjects,
  importProjects,
  permanentlyDeleteProject,
  updateProject,
} from "../controllers/project.controller.js";
import {
  createProjectSchema,
  importProjectsSchema,
  permanentDeleteProjectSchema,
  updateProjectSchema,
} from "../validators/project.validators.js";

const router = Router();

// Every route requires a logged-in Portal User. Unlike Users (Administrator/
// PMO Manager only), Projects is a broadly-used module every portal role
// works in day to day — module/region-level access (via the existing
// Module/UserModuleAccess grants from the Auth phase) is not yet enforced
// at the route layer, matching Auth's own note that finer-grained checks are
// "to be added alongside the modules that need them."
router.get("/", authenticate, getProjects);
router.get("/:id", authenticate, getProject);
router.post("/", authenticate, validate(createProjectSchema), createProject);
// Excel import — General Information for every row in one request; see
// bulkImportProjects() in project.service.ts for the all-or-nothing
// semantics (matches the pre-existing "if any row fails validation, the
// entire import is rejected" behavior the Import UI already documents).
router.post("/import", authenticate, validate(importProjectsSchema), importProjects);
router.patch("/:id", authenticate, validate(updateProjectSchema), updateProject);
// Archive — reversible, every portal role (same access rule as every other
// route in this file); this is the pre-existing Phase 3.1 soft-delete
// behavior, renamed for clarity, never redesigned.
router.delete("/:id", authenticate, archiveProject);
// Permanent Delete — irreversible, Administrator-only. A real row delete;
// QuantityItem/PaymentMilestone/ProjectExpense are removed automatically via
// their onDelete: Cascade foreign keys (see schema.prisma), never manually.
// Registered after "/:id" for readability, not because ordering matters here
// — Express matches "/:id/permanent" (two path segments) and "/:id" (one)
// independently regardless of declaration order.
router.delete("/:id/permanent", authenticate, authorize("Administrator"), validate(permanentDeleteProjectSchema), permanentlyDeleteProject);

export default router;
