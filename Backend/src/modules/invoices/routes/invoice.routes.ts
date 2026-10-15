import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireApprovalPermission } from "../../../shared/middleware/requireApprovalPermission.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  createInvoiceLine,
  deleteInvoiceLine,
  getAllInvoiceItemsForCaller,
  getInvoiceItemsByProject,
  getInvoiceNumberAvailability,
  ingestInvoiceLines,
  sendInvoiceLineTo,
  updateInvoiceLine,
} from "../controllers/invoice.controller.js";
import {
  createInvoiceLineSchema,
  ingestInvoiceLinesSchema,
  sendInvoiceLineToSchema,
  updateInvoiceLineSchema,
} from "../validators/invoice.validators.js";

const router = Router();

// Every logged-in Portal User with the "Invoices" module grant.
// Project-ownership authorization (may THIS caller touch THIS project's
// invoice data) is checked one layer deeper, inside each service function
// — including the one-hop InvoiceLine -> QuantityItem -> Project lookup for
// routes that only carry an invoice-line id.
router.get("/projects/:projectId/invoice-items", authenticate, requireModuleAccess("Invoices"), getInvoiceItemsByProject);
// Manual invoice numbering (Oct 2026) — read-only "is this number free?" check.
router.get(
  "/projects/:projectId/invoice-numbers/availability",
  authenticate,
  requireModuleAccess("Invoices"),
  getInvoiceNumberAvailability
);
// Sept 2026 — Reports/Dashboard Invoice Raised discrepancy fix. Every
// invoice line across every project this caller is authorized to see, in
// one request — used by Reports (useReportsData.ts) so it computes Invoice
// Raised from the same live, complete backend data the Dashboard KPI
// already uses, instead of from whatever's cached in each project's
// browser-local mirror. Declared before the "/projects/:projectId/..."
// route above only to keep every /projects/... route grouped together —
// it can never collide with it (different path shape entirely: "/invoice-
// items" has one fewer segment than "/projects/:projectId/invoice-items").
router.get("/invoice-items", authenticate, requireModuleAccess("Invoices"), getAllInvoiceItemsForCaller);
// Ingest — legacy-migration only, preserves caller-supplied ids and raw
// historical amounts; see invoice.service.ts's ingestInvoiceLinesForProject().
// Administrator-only: this is the one path that accepts a client-chosen id
// and raw financial snapshot values (unitPriceINR/calculatedAmountINR/
// commercialAdjustmentINR) instead of deriving them from Quantity/Milestones,
// so it must not be reachable by ordinary Invoices-module access — same
// precedent as timesheet.routes.ts's manual import and Delete-All/Delete-
// Permanently gates.
router.post(
  "/projects/:projectId/invoice-items/ingest",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Invoices"),
  authorize("Administrator"),
  validate(ingestInvoiceLinesSchema),
  ingestInvoiceLines
);
// Nested under the QuantityItem it bills against (not the project) — an
// InvoiceLine's identity is 100% scoped to its parent activity.
//
// Request Invoice workflow (Sept 2026) — this is the literal "Raise Invoice"
// action, so it is the one route gated by the new "Raise Invoice" approval
// permission on top of ordinary Invoices module access. See
// invoice.service.ts's updateInvoiceLine() for why the PATCH route below is
// NOT given the same blanket gate (a narrower, transition-specific check
// lives there instead) — the bypass this closes is documented there.
router.post(
  "/quantity/:quantityItemId/invoice-lines",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Invoices"),
  requireApprovalPermission("Raise Invoice"),
  validate(createInvoiceLineSchema),
  createInvoiceLine
);
router.patch(
  "/invoice-lines/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Invoices"),
  validate(updateInvoiceLineSchema),
  updateInvoiceLine
);
// Hard delete — only for a line the UI itself is removing before it was ever
// really "raised" (see invoice.service.ts's deleteInvoiceLine()). Undoing an
// already-raised invoice is a status PATCH to "Cancelled", not this.
// Invoice Edit/Delete approval rights (Oct 2026) — every delete, whether from
// Invoice History or a workspace removing a saved line, requires the
// "Delete Invoice" approval on top of Invoices module access and the
// service's project-ownership check.
router.delete(
  "/invoice-lines/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Invoices"),
  requireApprovalPermission("Delete Invoice"),
  deleteInvoiceLine
);
// Request Invoice workflow (Sept 2026) — Section C: "Send Invoice To." A
// separate, manual, post-raise action; no "Raise Invoice" permission
// required (any active user may be a recipient — see invoice.service.ts's
// sendInvoiceLineToUsers()).
router.post(
  "/invoice-lines/:id/send-to",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Invoices"),
  validate(sendInvoiceLineToSchema),
  sendInvoiceLineTo
);

export default router;
