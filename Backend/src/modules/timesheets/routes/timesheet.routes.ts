import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  deleteAllEntries,
  deleteEntry,
  editEntry,
  getEntries,
  getEntryHistory,
  getImportById,
  getImportRows,
  getImports,
  importTimesheet,
} from "../controllers/timesheet.controller.js";
import { getPendingProjects } from "../controllers/timesheetPending.controller.js";
import { editEntryBodySchema } from "../validators/timesheet.validators.js";

const router = Router();

// Memory storage, not disk — the parsed workbook never needs to survive
// past this one request, so there is no temp file to clean up (Stage 4 §17).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Administrator-only, matching the precedent already set by Delete
// Permanently — this is a recovery/backfill mechanism for when Graph/KEKA
// email ingestion is unavailable, NOT a manual employee-assignment path.
// It calls the exact same processTimesheetImport() engine as email
// ingestion (see timesheet.controller.ts's importTimesheet).
router.post(
  "/timesheets/import",
  authenticate,
  requireModuleAccess("Timesheets"),
  authorize("Administrator"),
  upload.single("file"),
  importTimesheet
);

router.get("/timesheets/imports", authenticate, requireModuleAccess("Timesheets"), getImports);
router.get("/timesheets/imports/:id", authenticate, requireModuleAccess("Timesheets"), getImportById);
router.get("/timesheets/imports/:id/rows", authenticate, requireModuleAccess("Timesheets"), getImportRows);

// GET /timesheets/entries is scoped to the caller's authorized projects (see
// timesheet.repository.ts's findEntries()) — a row with no project at all
// (the "Unassigned" import case) is always visible, since it isn't
// attributable to any project.
router.get("/timesheets/entries", authenticate, requireModuleAccess("Timesheets"), getEntries);
router.get("/timesheets/entries/:id/history", authenticate, requireModuleAccess("Timesheets"), getEntryHistory);

// The single backend source of truth for "Timesheet Pending" — see
// timesheetPending.service.ts for the confirmed business rule. Scoped to
// the caller's authorized projects (Administrator sees all) — see
// timesheetPending.repository.ts's findActiveProjectsForPendingCheck().
router.get("/timesheets/pending-projects", authenticate, requireModuleAccess("Timesheets"), getPendingProjects);

// Manual, single-row correction — any authenticated Portal User with
// Timesheets access, matching the Resources module's PATCH /resources/:id
// precedent (no role gate; this only ever touches one already-existing
// row's mutable fields).
router.patch("/timesheets/entries/:id", authenticate, requireModuleAccess("Timesheets"), validate(editEntryBodySchema), editEntry);

// Destructive — Administrator-only, matching the "Delete Permanently"/
// manual-import precedent (see importTimesheet above and
// project.routes.ts's DELETE /:id/permanent). Registered before the
// bulk route below only for readability; Express matches these two paths
// exactly (":id" vs no segment) so order between them has no effect.
router.delete(
  "/timesheets/entries/:id",
  authenticate,
  requireModuleAccess("Timesheets"),
  authorize("Administrator"),
  deleteEntry
);

// Delete-All — Administrator-only, irreversible. See timesheet.service.ts's
// deleteAllTimesheetEntries() for the ProjectResource-safety design (only
// pairs with a real TimesheetEntry are recomputed; purely manual
// Team-Assigned resources are never touched).
router.delete(
  "/timesheets/entries",
  authenticate,
  requireModuleAccess("Timesheets"),
  authorize("Administrator"),
  deleteAllEntries
);

export default router;
