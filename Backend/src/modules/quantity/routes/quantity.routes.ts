import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { validate } from "../../../shared/middleware/validate.js";
import { createQuantity, deleteQuantity, getQuantityByProject, updateQuantity } from "../controllers/quantity.controller.js";
import { createQuantitySchema, updateQuantitySchema } from "../validators/quantity.validators.js";

const router = Router();

// Same access rule as Projects — every logged-in Portal User, no
// authorize(...roles) narrowing (module/region-level checks are not yet
// enforced at the route layer, matching project.routes.ts's note).
router.get("/projects/:projectId/quantity", authenticate, getQuantityByProject);
router.post("/projects/:projectId/quantity", authenticate, validate(createQuantitySchema), createQuantity);
router.patch("/quantity/:id", authenticate, validate(updateQuantitySchema), updateQuantity);
router.delete("/quantity/:id", authenticate, deleteQuantity);

export default router;
