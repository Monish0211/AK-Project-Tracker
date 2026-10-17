import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { getAllAuthorizedExpenses } from "../controllers/expense.controller.js";

const router = Router();

// Reports data consistency (Oct 2026) — read-only, paginated, every active
// expense row across the caller's authorized projects. Same "Projects"
// module rule as GET /projects/:projectId/expenses; project-level access is
// applied inside the service as a query filter. Its own router because it
// must be mounted BEFORE projectRoutes (see app.ts) — otherwise
// projectRoutes' GET /:id would swallow "/projects/expenses" as id="expenses".
router.get("/projects/expenses", authenticate, requireModuleAccess("Projects"), getAllAuthorizedExpenses);

export default router;
