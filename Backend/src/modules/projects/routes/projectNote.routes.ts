import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import { createProjectNoteController, getProjectNotesController } from "../controllers/projectNote.controller.js";
import { createProjectNoteSchema } from "../validators/projectNote.validators.js";

const router = Router();

// Mounted at /projects/:projectId/notes
router.get(
  "/:projectId/notes",
  authenticate,
  requireModuleAccess("Projects"),
  getProjectNotesController
);

router.post(
  "/:projectId/notes",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  validate(createProjectNoteSchema),
  createProjectNoteController
);

export default router;
