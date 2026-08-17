import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { env } from "../../../shared/utils/env.js";
import { extractWithClaude } from "../controllers/pdfImport.controller.js";
import { pdfImportRateLimit } from "../middleware/pdfImportRateLimit.js";

const router = Router();

// memoryStorage, same as timesheet.routes.ts's upload.single("file") — the
// PDF never needs to survive past this one request, so there is no temp
// file to clean up.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.PDF_IMPORT_AI_MAX_FILE_SIZE_MB * 1024 * 1024 },
});

// Authenticated (any logged-in PMO user who can already use PDF Import can
// use this too — no stricter role gate is implied by anything approved in
// Stages 1-4), rate-limited, then multer, then the controller. No
// verifyInternalSecret here — this is a user-triggered action, not a
// scheduler/cron call.
router.post("/pdf-import/ai-extract", authenticate, pdfImportRateLimit, upload.single("file"), extractWithClaude);

export default router;
