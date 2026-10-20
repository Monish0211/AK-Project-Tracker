import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  getMissingExpenseRunHistory,
  getMissingExpenseSettings,
  getMissingExpenseUserOptions,
  previewMissingExpensePage,
  previewMissingExpenseReport,
  runMissingExpenseJobNow,
  updateMissingExpenseRecipients,
} from "../controllers/missingExpense.controller.js";
import { runMissingExpenseJobSchema, updateMissingExpenseRecipientsSchema } from "../validators/missingExpense.validators.js";

const router = Router();

// Mounted under /notification-settings/missing-expenses (Settings → Weekly
// Emails). Same gate as Settings → PMO Coordinators: the "Settings" module AND
// the Administrator or PMO Manager role on every route, reads included (the
// recipient list and user picker are not for ordinary users). No new
// permission is introduced.
const manage = [authenticate, requireModuleAccess("Settings"), authorize("Administrator", "PMO Manager")];

router.get("/", ...manage, getMissingExpenseSettings);
router.put("/", ...manage, denyReadOnlyWrites, validate(updateMissingExpenseRecipientsSchema), updateMissingExpenseRecipients);
router.get("/user-options", ...manage, getMissingExpenseUserOptions);
router.post("/preview", ...manage, previewMissingExpenseReport);
router.get("/preview", ...manage, previewMissingExpensePage); // paged, read-only
router.get("/runs", ...manage, getMissingExpenseRunHistory);
router.post("/run", ...manage, denyReadOnlyWrites, validate(runMissingExpenseJobSchema), runMissingExpenseJobNow);

export default router;
