import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { env } from "../../../shared/utils/env.js";
import {
  uploadProjectDocument,
  uploadPRRequestDocument,
  uploadCustomerGstDocument,
  listProjectDocuments,
  listPRRequestDocuments,
  downloadDocument,
  deleteDocument,
} from "../controllers/document.controller.js";

const router = Router();

// memoryStorage — same convention as PDF Import/Timesheet import (buffer
// passed straight to documentStorage.ts's writeDocumentFile(), never a temp
// file on disk). fileSize is set to the confirmed Nginx client_max_body_size
// ceiling (64M, see env.ts's own comment) purely to fail with a clean
// application error instead of Nginx's raw 413 — this is NOT a business
// file-size restriction, which the confirmed requirement explicitly rules
// out.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.DOCUMENT_UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024 },
});

// Documents is a Project/PR-Request sub-resource, not its own nav module —
// same precedent as Reminders (see reminder.routes.ts's own comment): gated
// by the PARENT resource's existing module grant ("Projects" or
// "Approvals", matching project.routes.ts/prRequest.routes.ts exactly),
// never a new "Documents" module that would need seeding and granting to
// every existing user. Project/PR-Request-level authorization (may THIS
// caller touch THIS specific one) is checked one layer deeper, inside
// document.service.ts.
router.post(
  "/projects/:projectId/documents",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects"),
  upload.single("file"),
  uploadProjectDocument
);
router.get("/projects/:projectId/documents", authenticate, requireModuleAccess("Projects"), listProjectDocuments);

router.post(
  "/pr-requests/:prRequestId/documents",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Approvals"),
  upload.single("file"),
  uploadPRRequestDocument
);
router.get("/pr-requests/:prRequestId/documents", authenticate, requireModuleAccess("Approvals"), listPRRequestDocuments);

// Customer GST Registration Document (Sep 2026) — called ONLY after the
// Customer row already exists (create or edit), never by the extraction
// endpoint (customers/routes/customer.routes.ts's own POST /gst-extract,
// which never persists). Same memoryStorage `upload` instance as the two
// routes above — one file, write-then-record via documentStorage.ts.
router.post(
  "/customers/:customerId/gst-document",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Customer Master"),
  upload.single("file"),
  uploadCustomerGstDocument
);

// Shared by every parent kind — either module grant is enough to reach the
// route; document.service.ts still re-checks real Project/PR Request/
// Customer authorization against the document's CURRENT parent before any
// filesystem access (see getDocumentForDownload()'s own comment).
router.get("/documents/:id/download", authenticate, requireModuleAccess("Projects", "Approvals", "Customer Master"), downloadDocument);

// Delete — Administrator ONLY, per the confirmed final rule. No uploader/
// creator ownership check anywhere in this chain or in the service below.
router.delete(
  "/documents/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects", "Approvals"),
  authorize("Administrator"),
  deleteDocument
);

export default router;
