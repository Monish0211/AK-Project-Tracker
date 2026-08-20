import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
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
  requireModuleAccess("Projects"),
  validate(createMilestoneSchema),
  createMilestone
);
// Ingest — legacy-migration / future-Import only, preserves caller-supplied
// ids; see milestone.service.ts's ingestMilestonesForProject().
router.post(
  "/projects/:projectId/milestones/ingest",
  authenticate,
  requireModuleAccess("Projects"),
  validate(ingestMilestonesSchema),
  ingestMilestones
);
router.patch(
  "/milestones/:id",
  authenticate,
  requireModuleAccess("Projects"),
  validate(updateMilestoneSchema),
  updateMilestone
);
router.delete("/milestones/:id", authenticate, requireModuleAccess("Projects"), deleteMilestone);

export default router;
