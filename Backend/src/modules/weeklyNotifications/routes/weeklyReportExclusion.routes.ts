import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.js";
import { authorize } from "../../../shared/middleware/authorize.js";
import { denyReadOnlyWrites } from "../../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../../shared/middleware/validate.js";
import { createReportExclusion, listReportExclusions, restoreReportExclusion } from "../controllers/weeklyReportExclusion.controller.js";
import { createExclusionSchema } from "../validators/weeklyReportExclusion.validators.js";

const router = Router();

// Mounted under /notification-settings/report-exclusions (Settings → Weekly Emails → Exclude / Excluded History, Nov 2026).
// ADMINISTRATORS ONLY: the Settings module plus the Administrator role from the token here, and the service re-reads the
// caller (active + Administrator) from the database on every call. PMO Managers keep their Weekly Emails access but get
// 403 on every route below. No new permission is introduced.
const adminOnly = [authenticate, requireModuleAccess("Settings"), authorize("Administrator")];

router.get("/", ...adminOnly, listReportExclusions);
router.post("/", ...adminOnly, denyReadOnlyWrites, validate(createExclusionSchema), createReportExclusion);
router.post("/:id/restore", ...adminOnly, denyReadOnlyWrites, restoreReportExclusion);

export default router;
