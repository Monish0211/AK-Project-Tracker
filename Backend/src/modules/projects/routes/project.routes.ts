import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { validate } from "../../../shared/middleware/validate.js";
import { createProject, deleteProject, getProject, getProjects, importProjects, updateProject } from "../controllers/project.controller.js";
import { createProjectSchema, importProjectsSchema, updateProjectSchema } from "../validators/project.validators.js";

const router = Router();

// Every route requires a logged-in Portal User. Unlike Users (Administrator/
// PMO Manager only), Projects is a broadly-used module every portal role
// works in day to day — module/region-level access (via the existing
// Module/UserModuleAccess grants from the Auth phase) is not yet enforced
// at the route layer, matching Auth's own note that finer-grained checks are
// "to be added alongside the modules that need them."
router.get("/", authenticate, getProjects);
router.get("/:id", authenticate, getProject);
router.post("/", authenticate, validate(createProjectSchema), createProject);
// Excel import — General Information for every row in one request; see
// bulkImportProjects() in project.service.ts for the all-or-nothing
// semantics (matches the pre-existing "if any row fails validation, the
// entire import is rejected" behavior the Import UI already documents).
router.post("/import", authenticate, validate(importProjectsSchema), importProjects);
router.patch("/:id", authenticate, validate(updateProjectSchema), updateProject);
router.delete("/:id", authenticate, deleteProject);

export default router;
