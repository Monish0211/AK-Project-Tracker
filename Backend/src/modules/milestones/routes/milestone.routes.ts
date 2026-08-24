import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  createMilestone,
  deleteMilestone,
  getMilestonesByProject,
  ingestMilestones,
  updateMilestone,
} from "../controllers/milestone.controller.js";
import { createMilestoneSchema, ingestMilestonesSchema, updateMilestoneSchema } from "../validators/milestone.validators.js";

const router = Router();

// Same access rule as Projects/Quantity — every logged-in Portal User with
// the "Projects" module grant (Milestones is a project sub-resource, not
// its own module). Project-ownership authorization is checked one layer
// deeper, inside each service function.
router.get("/projects/:projectId/milestones", authenticate, requireModuleAccess("Projects"), getMilestonesByProject);
router.post(
  "/projects/:projectId/milestones",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  validate(createMilestoneSchema),
  createMilestone
);
// Ingest — legacy-migration / future-Import only, preserves caller-supplied
// ids; see milestone.service.ts's ingestMilestonesForProject().
// Administrator-only, matching the invoice-ingest precedent (invoice.routes.ts) —
// this is the one path a client-chosen id is adopted verbatim, so it must
// not be reachable by ordinary Projects-module access.
router.post(
  "/projects/:projectId/milestones/ingest",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  authorize("Administrator"),
  validate(ingestMilestonesSchema),
  ingestMilestones
);
router.patch(
  "/milestones/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  validate(updateMilestoneSchema),
  updateMilestone
);
router.delete("/milestones/:id", authenticate, denyReadOnlyWrites, requireModuleAccess("Projects"), deleteMilestone);

export default router;
