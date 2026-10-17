import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { getAllAuthorizedQuantity } from "../controllers/quantity.controller.js";

const router = Router();

// Reports data consistency (Oct 2026) — read-only, paginated, every Quantity
// row across the caller's authorized projects. Same "Projects" module rule
// as GET /projects/:projectId/quantity; project-level access is applied
// inside the service as a query filter. Its own router because it must be
// mounted BEFORE projectRoutes (see app.ts) — otherwise projectRoutes'
// GET /:id would swallow "/projects/quantity" as id="quantity".
router.get("/projects/quantity", authenticate, requireModuleAccess("Projects"), getAllAuthorizedQuantity);

export default router;
