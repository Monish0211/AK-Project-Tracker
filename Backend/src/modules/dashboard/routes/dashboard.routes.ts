import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { getSummary } from "../controllers/dashboard.controller.js";

const router = Router();

router.get("/dashboard/summary", authenticate, requireModuleAccess("Dashboard"), getSummary);

export default router;
