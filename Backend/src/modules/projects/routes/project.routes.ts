import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireApprovalPermission } from "../../../shared/middleware/requireApprovalPermission.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  archiveProject,
  createProject,
  getProject,
  getProjects,
  importProjects,
  permanentlyDeleteProject,
  restoreProject,
  updateProject,
} from "../controllers/project.controller.js";
import { createProjectSchema, importProjectsSchema, updateProjectSchema } from "../validators/project.validators.js";

const router = Router();

// Every route requires a logged-in Portal User with the "Projects" module
// grant (requireModuleAccess) — enforced at the route layer, not just
// hidden client-side. Project-level authorization (may THIS caller touch
// THIS specific project) is checked one layer deeper, inside each service
// function — see shared/utils/projectAccess.ts. Write routes also run
// denyReadOnlyWrites after authenticate (Read Only may GET only).
router.get("/", authenticate, requireModuleAccess("Projects"), getProjects);
router.get("/:id", authenticate, requireModuleAccess("Projects"), getProject);
router.post("/", authenticate, denyReadOnlyWrites, requireModuleAccess("Projects"), validate(createProjectSchema), createProject);
// Excel import — General Information for every row in one request; see
// bulkImportProjects() in project.service.ts for the all-or-nothing
// semantics (matches the pre-existing "if any row fails validation, the
// entire import is rejected" behavior the Import UI already documents).
router.post("/import", authenticate, denyReadOnlyWrites, requireModuleAccess("Projects"), validate(importProjectsSchema), importProjects);
router.patch("/:id", authenticate, denyReadOnlyWrites, requireModuleAccess("Projects"), validate(updateProjectSchema), updateProject);
// Archive — reversible, the pre-existing Phase 3.1 soft-delete behavior,
// never redesigned. Gated by BOTH the "Projects" module grant AND the
// "Archive Projects" approval permission (not a role check — see
// requireApprovalPermission.ts), AND project-ownership access (checked
// inside the service). denyReadOnlyWrites runs before the approval check so
// Read Only is denied even if they hold the grant — same pattern as
// Permanent Delete below.
router.delete(
  "/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  requireApprovalPermission("Archive Projects"),
  archiveProject
);
// Recover — the exact inverse of Archive. Deliberately NOT gated by
// "Archive Projects" (or any approval permission) — only module access +
// project-ownership, same as View/Edit. The approval gate protects the
// consequential action (removing a project from the active list); reversing
// that action back is not treated as needing separate permission, mirroring
// how Permanent Delete has no matching "undo" gate either.
router.patch("/:id/restore", authenticate, denyReadOnlyWrites, requireModuleAccess("Projects"), restoreProject);
// Permanent Delete — irreversible, gated by BOTH the "Projects" module grant
// AND the "Delete Project Permanently" approval permission (not a role
// check — see requireApprovalPermission.ts), AND project-ownership access
// (checked inside the service). A full cascade delete; see
// hardDeleteProject() in project.repository.ts. Registered after "/:id" for
// readability, not because ordering matters here — Express matches
// "/:id/permanent" (two path segments) and "/:id" (one) independently
// regardless of declaration order. denyReadOnlyWrites runs before the
// approval check so Read Only is denied even if they hold the grant.
router.delete(
  "/:id/permanent",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  requireApprovalPermission("Delete Project Permanently"),
  permanentlyDeleteProject
);

export default router;
