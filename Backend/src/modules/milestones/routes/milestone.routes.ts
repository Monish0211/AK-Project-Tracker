import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
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

// Same access rule as Projects/Quantity — every logged-in Portal User, no
// authorize(...roles) narrowing (module/region-level checks are not yet
// enforced at the route layer, matching the established note on those
// modules).
router.get("/projects/:projectId/milestones", authenticate, getMilestonesByProject);
router.post("/projects/:projectId/milestones", authenticate, validate(createMilestoneSchema), createMilestone);
// Ingest — legacy-migration / future-Import only, preserves caller-supplied
// ids; see milestone.service.ts's ingestMilestonesForProject().
router.post(
  "/projects/:projectId/milestones/ingest",
  authenticate,
  validate(ingestMilestonesSchema),
  ingestMilestones
);
router.patch("/milestones/:id", authenticate, validate(updateMilestoneSchema), updateMilestone);
router.delete("/milestones/:id", authenticate, deleteMilestone);

export default router;
