import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  getCustomers,
  importCustomers,
  updateCustomer,
} from "../controllers/customer.controller.js";
import { createCustomerSchema, importCustomersSchema, updateCustomerSchema } from "../validators/customer.validators.js";

const router = Router();

// Mounted under /customers in app.ts — every logged-in Portal User with the
// "Customer Master" module grant. Global master data (like Employee Master):
// no project-ownership checks. Administrator does NOT bypass the module gate.
router.get("/", authenticate, requireModuleAccess("Customer Master"), getCustomers);
router.get("/:id", authenticate, requireModuleAccess("Customer Master"), getCustomer);
router.post(
  "/",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Customer Master"),
  validate(createCustomerSchema),
  createCustomer
);
router.post(
  "/import",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Customer Master"),
  validate(importCustomersSchema),
  importCustomers
);
router.patch(
  "/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Customer Master"),
  validate(updateCustomerSchema),
  updateCustomer
);
router.delete("/:id", authenticate, denyReadOnlyWrites, requireModuleAccess("Customer Master"), deleteCustomer);

export default router;
