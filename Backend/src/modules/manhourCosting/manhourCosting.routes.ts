import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../shared/middleware/requireModuleAccess.js";
import { getCosting, getOpenRuns, retry } from "./manhourCosting.controller.js";

const router = Router();

// The central manpower costing: anyone who can read the project reads the same authoritative figures (project / country access is checked in the
// service). The recovery endpoints need the "Manpower" module, the same grant that lets a user change an employee's hourly rate: no new permission.
router.get("/projects/:projectId/manhour-costing", authenticate, requireModuleAccess("Projects"), getCosting);
router.get("/manhour-refresh/runs", authenticate, requireModuleAccess("Manpower"), getOpenRuns);
router.post("/manhour-refresh/runs/:runId/retry", authenticate, denyReadOnlyWrites, requireModuleAccess("Manpower"), retry);

export default router;
