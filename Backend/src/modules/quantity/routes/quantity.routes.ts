import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import { createQuantity, deleteQuantity, getQuantityByProject, updateQuantity } from "../controllers/quantity.controller.js";
import { createQuantitySchema, updateQuantitySchema } from "../validators/quantity.validators.js";

const router = Router();

// Same access rule as Projects — every logged-in Portal User with the
// "Projects" module grant (Quantity is a project sub-resource, not its own
// module). Project-ownership authorization (may THIS caller touch THIS
// project) is checked one layer deeper, inside each service function.
router.get("/projects/:projectId/quantity", authenticate, requireModuleAccess("Projects"), getQuantityByProject);
router.post(
  "/projects/:projectId/quantity",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  validate(createQuantitySchema),
  createQuantity
);
router.patch(
  "/quantity/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  validate(updateQuantitySchema),
  updateQuantity
);
router.delete("/quantity/:id", authenticate, denyReadOnlyWrites, requireModuleAccess("Projects"), deleteQuantity);

export default router;
