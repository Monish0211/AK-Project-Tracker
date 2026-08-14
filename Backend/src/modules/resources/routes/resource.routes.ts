import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  createResource,
  deleteResource,
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
// this app — every logged-in Portal User, no authorize(...roles) narrowing.
router.get("/projects/:projectId/resources", authenticate, getResourcesByProject);
router.post("/projects/:projectId/resources", authenticate, validate(createResourceSchema), createResource);
router.get("/employees/:employeeNo/assignments", authenticate, getAssignmentsByEmployee);
router.patch("/resources/:id", authenticate, validate(updateResourceSchema), updateResource);
router.delete("/resources/:id", authenticate, deleteResource);

export default router;
