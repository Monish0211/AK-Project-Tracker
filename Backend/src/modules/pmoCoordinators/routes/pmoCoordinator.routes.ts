import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  createPmoCoordinator,
  deletePmoCoordinator,
  getPmoCoordinators,
  updatePmoCoordinator,
} from "../controllers/pmoCoordinator.controller.js";
import { createPmoCoordinatorSchema, updatePmoCoordinatorSchema } from "../validators/pmoCoordinator.validators.js";

const router = Router();

// Mounted under /pmo-coordinators in app.ts (Settings → PMO Coordinators).
// Every route — reads included — needs the "Settings" module grant AND the
// Administrator or PMO Manager role. Reads are not opened to every Settings
// user: each entry shows whether a PMO Portal account exists and whether it
// is inactive/locked/missing the Projects module, the same kind of account
// detail GET /users already restricts to these two roles. The project
// picker's narrower coordinator list is a separate, later endpoint.
const manage = [authenticate, requireModuleAccess("Settings"), authorize("Administrator", "PMO Manager")];

router.get("/", ...manage, getPmoCoordinators);
// denyReadOnlyWrites is belt-and-suspenders (authorize already excludes Read Only).
router.post("/", ...manage, denyReadOnlyWrites, validate(createPmoCoordinatorSchema), createPmoCoordinator);
router.patch("/:id", ...manage, denyReadOnlyWrites, validate(updatePmoCoordinatorSchema), updatePmoCoordinator);
router.delete("/:id", ...manage, denyReadOnlyWrites, deletePmoCoordinator);

export default router;
