import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
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

// Same access rule as Projects/Quantity/Milestones — every logged-in
// Portal User, no authorize(...roles) narrowing (module/region-level checks
// are not yet enforced at the route layer, matching the established note on
// those modules).
router.get("/projects/:projectId/invoice-items", authenticate, getInvoiceItemsByProject);
// Ingest — legacy-migration only, preserves caller-supplied ids and raw
// historical amounts; see invoice.service.ts's ingestInvoiceLinesForProject().
router.post(
  "/projects/:projectId/invoice-items/ingest",
  authenticate,
  validate(ingestInvoiceLinesSchema),
  ingestInvoiceLines
);
// Nested under the QuantityItem it bills against (not the project) — an
// InvoiceLine's identity is 100% scoped to its parent activity.
router.post(
  "/quantity/:quantityItemId/invoice-lines",
  authenticate,
  validate(createInvoiceLineSchema),
  createInvoiceLine
);
router.patch("/invoice-lines/:id", authenticate, validate(updateInvoiceLineSchema), updateInvoiceLine);
// Hard delete — only for a line the UI itself is removing before it was ever
// really "raised" (see invoice.service.ts's deleteInvoiceLine()). Undoing an
// already-raised invoice is a status PATCH to "Cancelled", not this.
router.delete("/invoice-lines/:id", authenticate, deleteInvoiceLine);

export default router;
