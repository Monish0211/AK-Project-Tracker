import { Router } from "express";
import type { RequestHandler } from "express";
import multer from "multer";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites, denyReadOnlyWritesExceptAssignedCoordinator } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { env } from "../../../shared/utils/env.js";
import { AppError } from "../../../shared/utils/AppError.js";
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
// file on disk). Project / PR Request documents: DOCUMENT_UPLOAD_MAX_FILE_SIZE_MB
// (100 MB per file, Nov 2026 — see env.ts). The Customer GST document keeps its
// own, unchanged 64 MB ceiling (its form allows 10 MB anyway).
// +1 byte: multer (busboy) reports a file whose size EQUALS fileSize as over the limit, so a file of exactly 100 MB would be refused.
// With one extra byte, exactly 100 MB is accepted and 100 MB + 1 byte is refused (both proven in documentUploadLimit.http.test.ts).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.DOCUMENT_UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024 + 1 },
});
const GST_DOCUMENT_MAX_FILE_SIZE_MB = 64;
const gstUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: GST_DOCUMENT_MAX_FILE_SIZE_MB * 1024 * 1024 },
});

/**
 * One file from the "file" field, with multer's own errors turned into clear client errors instead of a raw 500: a file over the
 * limit is a 413 naming the limit (nothing is written, multer stops reading at the limit), any other multipart problem a 400.
 */
function singleFile(instance: multer.Multer, limitMb: number): RequestHandler {
  const handler = instance.single("file");
  return (req, res, next) => {
    handler(req, res, (err?: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") return next(new AppError(`The file is larger than the ${limitMb} MB limit. Upload a file of ${limitMb} MB or less.`, 413));
        return next(new AppError(`The upload could not be read (${err.message}).`, 400));
      }
      next(err as Error | undefined);
    });
  };
}
const documentFile = singleFile(upload, env.DOCUMENT_UPLOAD_MAX_FILE_SIZE_MB);
const gstDocumentFile = singleFile(gstUpload, GST_DOCUMENT_MAX_FILE_SIZE_MB);

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
  denyReadOnlyWritesExceptAssignedCoordinator({ param: "projectId" }),
  requireModuleAccess("Projects"),
  documentFile,
  uploadProjectDocument
);
router.get("/projects/:projectId/documents", authenticate, requireModuleAccess("Projects"), listProjectDocuments);

router.post(
  "/pr-requests/:prRequestId/documents",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("PR Request", "Approvals"),
  documentFile,
  uploadPRRequestDocument
);
router.get("/pr-requests/:prRequestId/documents", authenticate, requireModuleAccess("PR Request", "Approvals"), listPRRequestDocuments);

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
  gstDocumentFile,
  uploadCustomerGstDocument
);

// Shared by every parent kind — either module grant is enough to reach the
// route; document.service.ts still re-checks real Project/PR Request/
// Customer authorization against the document's CURRENT parent before any
// filesystem access (see getDocumentForDownload()'s own comment).
router.get(
  "/documents/:id/download",
  authenticate,
  requireModuleAccess("Projects", "Approvals", "PR Request", "Customer Master"),
  downloadDocument
);

// Delete — Administrator ONLY, per the confirmed final rule. No uploader/
// creator ownership check anywhere in this chain or in the service below.
router.delete(
  "/documents/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Projects", "Approvals", "PR Request"),
  authorize("Administrator"),
  deleteDocument
);

export default router;
