import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import { createExpense, deleteExpense, getExpensesByProject, updateExpense } from "../controllers/expense.controller.js";
import { createExpenseSchema, updateExpenseSchema } from "../validators/expense.validators.js";

const router = Router();

// Same access rule as Quantity/Projects — every logged-in Portal User with
// the "Projects" module grant (Expenses is a project sub-resource, not its
// own module). Project-ownership authorization is checked one layer
// deeper, inside each service function.
router.get("/projects/:projectId/expenses", authenticate, requireModuleAccess("Projects"), getExpensesByProject);
router.post(
  "/projects/:projectId/expenses",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  validate(createExpenseSchema),
  createExpense
);
router.patch(
  "/expenses/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  validate(updateExpenseSchema),
  updateExpense
);
router.delete("/expenses/:id", authenticate, denyReadOnlyWrites, requireModuleAccess("Projects"), deleteExpense);

export default router;
