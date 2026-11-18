import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { denyReadOnlyWrites, denyReadOnlyWritesExceptAssignedCoordinator } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireApprovalPermission } from "../../../shared/middleware/requireApprovalPermission.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  archiveProject,
  createProject,
  getLdReviewReport,
  getPrCategoryCountries,
  getProject,
  getProjects,
  getProjectStatusCounts,
  importProjects,
  previewImport,
  permanentlyDeleteProject,
  restoreProject,
  updateProject,
} from "../controllers/project.controller.js";
import { getPmoCoordinatorOptions } from "../../pmoCoordinators/index.js";
import { createProjectRequestSchema, importPreviewSchema, importProjectsSchema, updateProjectSchema } from "../validators/project.validators.js";

const router = Router();

// Every route requires a logged-in Portal User with the "Projects" module
// grant (requireModuleAccess) — enforced at the route layer, not just
// hidden client-side. Project-level authorization (may THIS caller touch
// THIS specific project) is checked one layer deeper, inside each service
// function — see shared/utils/projectAccess.ts. Write routes also run
// denyReadOnlyWrites after authenticate (Read Only may GET only).
router.get("/", authenticate, requireModuleAccess("Projects"), getProjects);
// Registered BEFORE "/:id" below — unlike "/:id/permanent" (a different
// path-segment count, so Express can never confuse the two regardless of
// order), "/status-counts" is a single segment and WOULD be swallowed by
// "/:id" (treated as id="status-counts") if declared after it.
router.get("/status-counts", authenticate, requireModuleAccess("Projects"), getProjectStatusCounts);
// The General Information PMO Coordinator picker — registered names with
// live account eligibility. Before "/:id" for the same reason as above.
// "Approvals" and "PR Request" too: the PR Request draft form renders the same General
// Information card (a PR Request stays text-only — see project.validators.ts), and a
// requester holding only "PR Request" must still be able to fill it in.
router.get("/pmo-coordinators", authenticate, requireModuleAccess("Projects", "Approvals", "PR Request"), getPmoCoordinatorOptions);
// PR Category -> country reference (single backend source), with the caller's authorization per country. Before "/:id".
// "Reports" is included because the country-aware Reports page labels each country section from it (a Reports-only user would otherwise see
// the stored category name, e.g. FZI instead of FZE). The reference is read-only metadata and grants no project data.
router.get("/pr-category-countries", authenticate, requireModuleAccess("Projects", "Approvals", "PR Request", "Reports"), getPrCategoryCountries);
// Read-only Liquidated Damages classification report (Phase 4 final). Administrator / PMO Manager only; limited to the caller's countries in the service.
router.get("/liquidated-damages/review", authenticate, requireModuleAccess("Projects"), authorize("Administrator", "PMO Manager"), getLdReviewReport);
router.get("/:id", authenticate, requireModuleAccess("Projects"), getProject);
// Direct project creation needs the "Add Project" grant IN ADDITION to "Projects" (Oct 2026) — two chained
// requireModuleAccess calls, i.e. both are required, not either. Viewing/editing/archiving existing projects keep their own
// rules; a PR Request approval creates its Project through the service layer, not through this route, so approvers do not
// need "Add Project".
router.post(
  "/",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  requireModuleAccess("Add Project"),
  validate(createProjectRequestSchema),
  createProject
);
// Excel import — General Information for every row in one request; see
// bulkImportProjects() in project.service.ts for the all-or-nothing
// semantics (matches the pre-existing "if any row fails validation, the
// entire import is rejected" behavior the Import UI already documents).
router.post(
  "/import",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  requireModuleAccess("Add Project"),
  validate(importProjectsSchema),
  importProjects
);
// Non-committing import check (country per row, authorization, duplicates). Same gates as the import itself; writes nothing.
router.post(
  "/import/preview",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  requireModuleAccess("Add Project"),
  validate(importPreviewSchema),
  previewImport
);
// Edit — a Read Only user may write here only while they are THIS
// project's assigned PMO Coordinator (see
// denyReadOnlyWritesExceptAssignedCoordinator, which lists every route with
// the same exception). Module access and the service's project-access check
// still apply after it.
router.patch(
  "/:id",
  authenticate,
  denyReadOnlyWritesExceptAssignedCoordinator({ param: "id" }),
  requireModuleAccess("Projects"),
  validate(updateProjectSchema),
  updateProject
);
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
