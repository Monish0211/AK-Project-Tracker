import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import { getInvoicePayments, previewInvoicePayment, recordInvoicePayment, reverseInvoicePayment } from "../controllers/invoicePayment.controller.js";
import { previewPaymentSchema, reversePaymentSchema, savePaymentSchema } from "../validators/invoicePayment.validators.js";

const router = Router();

// Invoices module access for every route. Project access (may THIS caller touch THIS project) and the "Edit Invoice"
// approval needed to record / preview / reverse are checked one layer deeper, in the service. denyReadOnlyWrites blocks
// every non-GET for the Read Only role. Invoice numbers can contain "/", so the invoice travels in the query / body,
// never in the path.
router.get("/invoice-payments", authenticate, requireModuleAccess("Invoices"), getInvoicePayments);
router.post("/invoice-payments/preview", authenticate, denyReadOnlyWrites, requireModuleAccess("Invoices"), validate(previewPaymentSchema), previewInvoicePayment);
router.post("/invoice-payments", authenticate, denyReadOnlyWrites, requireModuleAccess("Invoices"), validate(savePaymentSchema), recordInvoicePayment);
router.post("/invoice-payments/:id/reverse", authenticate, denyReadOnlyWrites, requireModuleAccess("Invoices"), validate(reversePaymentSchema), reverseInvoicePayment);

export default router;
