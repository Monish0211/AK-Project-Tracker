import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
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
// function — see shared/utils/projectAccess.ts.
router.get("/", authenticate, requireModuleAccess("Projects"), getProjects);
router.get("/:id", authenticate, requireModuleAccess("Projects"), getProject);
router.post("/", authenticate, requireModuleAccess("Projects"), validate(createProjectSchema), createProject);
// Excel import — General Information for every row in one request; see
// bulkImportProjects() in project.service.ts for the all-or-nothing
// semantics (matches the pre-existing "if any row fails validation, the
// entire import is rejected" behavior the Import UI already documents).
router.post("/import", authenticate, requireModuleAccess("Projects"), validate(importProjectsSchema), importProjects);
router.patch("/:id", authenticate, requireModuleAccess("Projects"), validate(updateProjectSchema), updateProject);
// Archive — reversible, every portal role with Projects access (same access
// rule as every other route in this file); this is the pre-existing Phase
// 3.1 soft-delete behavior, renamed for clarity, never redesigned. No
// special approval permission — only module access + project-ownership.
router.delete("/:id", authenticate, requireModuleAccess("Projects"), archiveProject);
// Recover — the exact inverse of Archive, same access rule (no special
// permission; any user with Project access may recover).
router.patch("/:id/restore", authenticate, requireModuleAccess("Projects"), restoreProject);
// Permanent Delete — irreversible, gated by BOTH the "Projects" module grant
// AND the "Delete Project Permanently" approval permission (not a role
// check — see requireApprovalPermission.ts), AND project-ownership access
// (checked inside the service). A full cascade delete; see
// hardDeleteProject() in project.repository.ts. Registered after "/:id" for
// readability, not because ordering matters here — Express matches
// "/:id/permanent" (two path segments) and "/:id" (one) independently
// regardless of declaration order.
router.delete(
  "/:id/permanent",
  authenticate,
  requireModuleAccess("Projects"),
  requireApprovalPermission("Delete Project Permanently"),
  permanentlyDeleteProject
);

export default router;
