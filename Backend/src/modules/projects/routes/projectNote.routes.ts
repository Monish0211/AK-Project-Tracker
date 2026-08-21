import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { createProjectNoteController, getProjectNotesController } from "../controllers/projectNote.controller.js";

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
  createProjectNoteController
);

export default router;
