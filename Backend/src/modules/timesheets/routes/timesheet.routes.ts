import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import {
  getEntries,
  getEntryHistory,
  getImportById,
  getImportRows,
  getImports,
  importTimesheet,
} from "../controllers/timesheet.controller.js";

const router = Router();

// Memory storage, not disk — the parsed workbook never needs to survive
// past this one request, so there is no temp file to clean up (Stage 4 §17).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Administrator-only, matching the precedent already set by Delete
// Permanently — this is a recovery/backfill mechanism for when Graph/KEKA
// email ingestion is unavailable, NOT a manual employee-assignment path.
// It calls the exact same processTimesheetImport() engine as email
// ingestion (see timesheet.controller.ts's importTimesheet).
router.post("/timesheets/import", authenticate, authorize("Administrator"), upload.single("file"), importTimesheet);

router.get("/timesheets/imports", authenticate, getImports);
router.get("/timesheets/imports/:id", authenticate, getImportById);
router.get("/timesheets/imports/:id/rows", authenticate, getImportRows);

router.get("/timesheets/entries", authenticate, getEntries);
router.get("/timesheets/entries/:id/history", authenticate, getEntryHistory);

export default router;
