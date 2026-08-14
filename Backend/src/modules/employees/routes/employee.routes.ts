import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  createEmployee,
  deleteEmployee,
  getEmployee,
  getEmployees,
  importEmployees,
  updateEmployee,
} from "../controllers/employee.controller.js";
import { createEmployeeSchema, importEmployeesSchema, updateEmployeeSchema } from "../validators/employee.validators.js";

const router = Router();

// Mounted under /employees in app.ts (declares only relative paths, same
// convention as /users and the base /projects routes) — every logged-in
// Portal User, no authorize(...roles) narrowing, matching every other
// module in this app.
router.get("/", authenticate, getEmployees);
router.get("/:id", authenticate, getEmployee);
router.post("/", authenticate, validate(createEmployeeSchema), createEmployee);
// Excel import — parsed client-side, sent as JSON, same all-rows-attempted
// (never all-or-nothing) semantics the existing frontend import already has.
router.post("/import", authenticate, validate(importEmployeesSchema), importEmployees);
router.patch("/:id", authenticate, validate(updateEmployeeSchema), updateEmployee);
router.delete("/:id", authenticate, deleteEmployee);

export default router;
