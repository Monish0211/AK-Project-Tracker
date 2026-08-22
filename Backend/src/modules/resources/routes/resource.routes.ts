import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  createResource,
  deleteResource,
  getAllAuthorizedResources,
  getAssignmentsByEmployee,
  getResourcesByProject,
  updateResource,
} from "../controllers/resource.controller.js";
import { createResourceSchema, updateResourceSchema } from "../validators/resource.validators.js";

const router = Router();

// Phase 3.7 — backend-only. No frontend code calls these routes yet; Team
// Assigned's live UI continues to compute everything from raw Timesheet
// data exactly as it does today (see schema.prisma's ProjectResource model
// comment). A future Timesheet backend phase becomes the only process that
// ever calls Create/Update here. Same access rule as every other module in
// this app — every logged-in Portal User with the "Projects" module grant
// (Resources is a project sub-resource, not its own module).
// Project-ownership authorization is checked one layer deeper, inside each
// service function — except getAssignmentsByEmployee, which spans multiple
// projects at once and is documented as a known gap (see security audit).
router.get("/projects/resources", authenticate, requireModuleAccess("Projects"), getAllAuthorizedResources);
router.get("/projects/:projectId/resources", authenticate, requireModuleAccess("Projects"), getResourcesByProject);
router.post(
  "/projects/:projectId/resources",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  validate(createResourceSchema),
  createResource
);
router.get("/employees/:employeeNo/assignments", authenticate, requireModuleAccess("Projects"), getAssignmentsByEmployee);
router.patch(
  "/resources/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  validate(updateResourceSchema),
  updateResource
);
router.delete("/resources/:id", authenticate, denyReadOnlyWrites, requireModuleAccess("Projects"), deleteResource);

export default router;
