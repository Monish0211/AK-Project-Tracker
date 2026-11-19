import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { denyReadOnlyWrites } from "../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../shared/middleware/requireModuleAccess.js";
import * as c from "./countryReminder.controller.js";

const router = Router();

// Settings → Country Reminders (per-country project reminder alerts switch + its change history; the Weekly Emails stay global and are not here): the same gate as Settings → Weekly Emails (the "Settings" module AND the Administrator or PMO Manager role) on every route, reads included.
// The country check is separate and is made in the service from the user's current grants: the role never grants a country.
const manage = [authenticate, requireModuleAccess("Settings"), authorize("Administrator", "PMO Manager")];

router.get("/country-reminder-settings", ...manage, c.listSettings);
router.put("/country-reminder-settings/:regionId/:type", ...manage, denyReadOnlyWrites, c.updateSetting);
router.get("/country-reminder-settings/:regionId/audit", ...manage, c.listAudit);

// Important reminders of ONE country. Reading: anyone with the Projects module, limited to the countries they hold and the one they have selected.
// Writing: Administrator or PMO Manager, and only for a country they hold.
const read = [authenticate, requireModuleAccess("Projects")];
const write = [authenticate, requireModuleAccess("Projects"), authorize("Administrator", "PMO Manager"), denyReadOnlyWrites];

router.get("/country-reminders", ...read, c.listReminders);
router.post("/country-reminders", ...write, c.createReminder);
router.patch("/country-reminders/:id", ...write, c.updateReminder);
router.delete("/country-reminders/:id", ...write, c.deleteReminder);

export default router;
