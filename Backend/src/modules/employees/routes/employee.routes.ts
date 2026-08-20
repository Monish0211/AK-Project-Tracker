import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
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
// Portal User with the "Manpower" module grant (Employee Master maps to
// Manpower by Sidebar convention).
router.get("/", authenticate, requireModuleAccess("Manpower"), getEmployees);
router.get("/:id", authenticate, requireModuleAccess("Manpower"), getEmployee);
router.post("/", authenticate, requireModuleAccess("Manpower"), validate(createEmployeeSchema), createEmployee);
// Excel import — parsed client-side, sent as JSON, same all-rows-attempted
// (never all-or-nothing) semantics the existing frontend import already has.
router.post("/import", authenticate, requireModuleAccess("Manpower"), validate(importEmployeesSchema), importEmployees);
router.patch("/:id", authenticate, requireModuleAccess("Manpower"), validate(updateEmployeeSchema), updateEmployee);
router.delete("/:id", authenticate, requireModuleAccess("Manpower"), deleteEmployee);

export default router;
