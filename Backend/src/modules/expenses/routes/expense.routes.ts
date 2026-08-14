import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { validate } from "../../../shared/middleware/validate.js";
import { createExpense, deleteExpense, getExpensesByProject, updateExpense } from "../controllers/expense.controller.js";
import { createExpenseSchema, updateExpenseSchema } from "../validators/expense.validators.js";

const router = Router();

// Same access rule as Quantity/Projects — every logged-in Portal User, no
// authorize(...roles) narrowing (module/region-level checks are not yet
// enforced at the route layer, matching project.routes.ts's note).
router.get("/projects/:projectId/expenses", authenticate, getExpensesByProject);
router.post("/projects/:projectId/expenses", authenticate, validate(createExpenseSchema), createExpense);
router.patch("/expenses/:id", authenticate, validate(updateExpenseSchema), updateExpense);
router.delete("/expenses/:id", authenticate, deleteExpense);

export default router;
