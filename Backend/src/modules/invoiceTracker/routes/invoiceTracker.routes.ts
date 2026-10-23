import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { getInvoiceTrackerMonth, getInvoiceTrackerOutstanding, getInvoiceTrackerProjectInvoices, getInvoiceTrackerRaisedBreakdown } from "../controllers/invoiceTracker.controller.js";

const router = Router();

// Mounted under /invoice-tracker. Read-only. Page access is the existing "Invoices" module (the approved decision —
// no new permission key); project visibility is applied in the service with authorizedProjectReadWhere() /
// assertProjectReadAccessById(), the same rules every other cross-project list uses. View / Edit / Delete of an
// invoice are NOT here: they keep using the existing /invoice-lines endpoints and their own approval gates.
const access = [authenticate, requireModuleAccess("Invoices")];

router.get("/", ...access, getInvoiceTrackerMonth);
router.get("/outstanding", ...access, getInvoiceTrackerOutstanding);
// The invoices behind the "Raised invoice amount" card — same query (month, search, status, filter) as the list; paged by project.
router.get("/raised-breakdown", ...access, getInvoiceTrackerRaisedBreakdown);
// Path kept from the first release; it now returns the project's workflow records (invoices + invoice requests) for the month.
router.get("/projects/:projectId/invoices", ...access, getInvoiceTrackerProjectInvoices);

export default router;
