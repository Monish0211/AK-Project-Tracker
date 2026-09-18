import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  createProjectNoteController,
  getAllNotesController,
  getProjectNotesController,
} from "../controllers/projectNote.controller.js";
import { createProjectNoteSchema } from "../validators/projectNote.validators.js";

const router = Router();

// Mounted at /projects/notes — the dedicated read-only Notes register page
// (GET only; no create/update/delete here — see projectNote.service.ts's
// listAllNotesForCaller()). Declared before /:projectId/notes below only to
// keep the two GET routes grouped together; they don't actually collide —
// "/notes" (2 path segments once mounted) can never match
// "/:projectId/notes" (3 segments).
router.get("/notes", authenticate, requireModuleAccess("Projects"), getAllNotesController);

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
