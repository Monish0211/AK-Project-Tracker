import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { previewExpenseImport, commitExpenseImport } from "./expenseImport.controller.js";

const router = Router();

// memoryStorage — same convention as Documents/Timesheet Excel import: the
// buffer is parsed in-memory (xlsx), never written to disk, and never
// forwarded anywhere else. 10MB ceiling enforced again inside
// expenseImport.service.ts (this multer limit exists to fail cleanly with a
// multer error rather than silently buffering something huge first).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Other Project Expenses Excel Import is a Projects sub-resource, same
// module-access rule as every other route in this module (see
// expense.routes.ts) — not a new nav module. denyReadOnlyWrites gates the
// commit route (a real write); preview is read-only (parses + classifies,
// never persists) but still requires authentication and the same module
// grant, matching every other read in this module.
router.post(
  "/projects/expenses/import/preview",
  authenticate,
  requireModuleAccess("Projects"),
  upload.single("file"),
  previewExpenseImport
);

router.post(
  "/projects/expenses/import",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  upload.single("file"),
  commitExpenseImport
);

export default router;
