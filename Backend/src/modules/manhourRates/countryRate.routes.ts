import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../shared/middleware/denyReadOnlyWrites.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { requireModuleAccess } from "../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../shared/middleware/validate.js";
import { apply, createVersion, history, legacyReview, list, openRuns, previewApply, retry } from "./countryRate.controller.js";
import { applyCountryRateSchema, setCountryRateSchema } from "./countryRate.validators.js";

const router = Router();

// Phase 4 (central country rates): Manpower -> Manpower Conversion Rates. EVERY route needs the explicit "Manpower Conversion Rates" Module Access grant
// (no role bypass, independent of the ordinary "Manpower" module). Reading needs only the grant; changing, reviewing what an apply would change,
// applying and retrying also need the Administrator or PMO Manager role (the Phase 4 rule). Country access and the same checks are repeated in the
// service, so a direct API call cannot bypass any of it.
const MODULE = "Manpower Conversion Rates";
const read = [authenticate, requireModuleAccess(MODULE)];
const write = [authenticate, requireModuleAccess(MODULE), authorize("Administrator", "PMO Manager"), denyReadOnlyWrites];

router.get("/manhour-conversion-rates", ...read, list);
router.get("/manhour-conversion-rates/runs", ...read, openRuns);
router.post("/manhour-conversion-rates/runs/:runId/retry", ...write, retry);
router.get("/manhour-conversion-rates/:regionId/history", ...read, history);
// Read-only classification of how a country's existing records were converted (consistent / legacy project rate / older version / missing / needs review).
router.get("/manhour-conversion-rates/:regionId/legacy-review", ...read, legacyReview);
router.get("/manhour-conversion-rates/:regionId/apply-preview", ...write, previewApply);
router.post("/manhour-conversion-rates/:regionId/versions", ...write, validate(setCountryRateSchema), createVersion);
router.post("/manhour-conversion-rates/:regionId/apply", ...write, validate(applyCountryRateSchema), apply);

export default router;
