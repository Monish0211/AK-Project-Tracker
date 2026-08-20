import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  createInvoiceLine,
  deleteInvoiceLine,
  getInvoiceItemsByProject,
  ingestInvoiceLines,
  updateInvoiceLine,
} from "../controllers/invoice.controller.js";
import { createInvoiceLineSchema, ingestInvoiceLinesSchema, updateInvoiceLineSchema } from "../validators/invoice.validators.js";

const router = Router();

// Every logged-in Portal User with the "Invoices" module grant.
// Project-ownership authorization (may THIS caller touch THIS project's
// invoice data) is checked one layer deeper, inside each service function
// — including the one-hop InvoiceLine -> QuantityItem -> Project lookup for
// routes that only carry an invoice-line id.
router.get("/projects/:projectId/invoice-items", authenticate, requireModuleAccess("Invoices"), getInvoiceItemsByProject);
// Ingest — legacy-migration only, preserves caller-supplied ids and raw
// historical amounts; see invoice.service.ts's ingestInvoiceLinesForProject().
router.post(
  "/projects/:projectId/invoice-items/ingest",
  authenticate,
  requireModuleAccess("Invoices"),
  validate(ingestInvoiceLinesSchema),
  ingestInvoiceLines
);
// Nested under the QuantityItem it bills against (not the project) — an
// InvoiceLine's identity is 100% scoped to its parent activity.
router.post(
  "/quantity/:quantityItemId/invoice-lines",
  authenticate,
  requireModuleAccess("Invoices"),
  validate(createInvoiceLineSchema),
  createInvoiceLine
);
router.patch(
  "/invoice-lines/:id",
  authenticate,
  requireModuleAccess("Invoices"),
  validate(updateInvoiceLineSchema),
  updateInvoiceLine
);
// Hard delete — only for a line the UI itself is removing before it was ever
// really "raised" (see invoice.service.ts's deleteInvoiceLine()). Undoing an
// already-raised invoice is a status PATCH to "Cancelled", not this.
router.delete("/invoice-lines/:id", authenticate, requireModuleAccess("Invoices"), deleteInvoiceLine);

export default router;
