import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  getUnpaidInvoiceRunHistory,
  getUnpaidInvoiceSettings,
  getUnpaidInvoiceUserOptions,
  previewUnpaidInvoicePage,
  previewUnpaidInvoiceReport,
  runUnpaidInvoiceJobNow,
  updateUnpaidInvoiceRecipients,
} from "../controllers/unpaidInvoice.controller.js";
import { runMissingExpenseJobSchema, updateMissingExpenseRecipientsSchema } from "../validators/missingExpense.validators.js";

const router = Router();

// Mounted under /notification-settings/unpaid-invoices (Settings → Weekly
// Emails). Same gate as the Other Project Expenses email: the "Settings"
// module AND the Administrator or PMO Manager role. The preview lists
// invoice numbers and amounts, so it additionally needs the "Invoices"
// module. No new permission is introduced.
const manage = [authenticate, requireModuleAccess("Settings"), authorize("Administrator", "PMO Manager")];

router.get("/", ...manage, getUnpaidInvoiceSettings);
router.put("/", ...manage, denyReadOnlyWrites, validate(updateMissingExpenseRecipientsSchema), updateUnpaidInvoiceRecipients);
router.get("/user-options", ...manage, getUnpaidInvoiceUserOptions);
router.post("/preview", ...manage, requireModuleAccess("Invoices"), previewUnpaidInvoiceReport);
router.get("/preview", ...manage, requireModuleAccess("Invoices"), previewUnpaidInvoicePage); // paged, read-only
router.get("/runs", ...manage, getUnpaidInvoiceRunHistory); // counts and statuses only — no invoice data
router.post("/run", ...manage, denyReadOnlyWrites, validate(runMissingExpenseJobSchema), runUnpaidInvoiceJobNow);

export default router;
