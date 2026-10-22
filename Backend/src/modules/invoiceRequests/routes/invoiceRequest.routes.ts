import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import { createInvoiceRequest, getInvoiceRequestsForProject } from "../controllers/invoiceRequest.controller.js";
import { createInvoiceRequestSchema } from "../validators/invoiceRequest.validators.js";
import { parseInvoiceRequestUpload, unpackInvoiceRequestPayload } from "../invoiceRequestUpload.middleware.js";

const router = Router();

// Every logged-in Portal User with the "Invoices" module grant — same gate
// as every other invoice.routes.ts route. Project-ownership authorization
// is checked one layer deeper, inside the service (assertProjectAccessById).
//
// Request Invoice — Section A. Any Invoices user may ask a specific
// eligible responsible person to raise an invoice for this project; the
// caller does NOT need the "Raise Invoice" permission themselves to submit
// a request (only to actually raise one — see invoice.routes.ts).
router.post(
  "/projects/:projectId/invoice-requests",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Invoices"),
  // Attachments (Oct 2026): a multipart body (JSON "payload" + files) is parsed and unpacked here; a plain JSON body passes
  // straight through both, so the request without files is exactly what it was. Both run AFTER authentication/authorization, so
  // an unauthorized caller's upload is never even read.
  parseInvoiceRequestUpload,
  unpackInvoiceRequestPayload,
  validate(createInvoiceRequestSchema),
  createInvoiceRequest
);
// No separate Invoice Requests page in this phase — this GET exists only so
// the project's own Invoices tab can show "a request is already pending"
// (duplicate-submission UX) and who it's assigned to.
router.get(
  "/projects/:projectId/invoice-requests",
  authenticate,
  requireModuleAccess("Invoices"),
  getInvoiceRequestsForProject
);

export default router;
