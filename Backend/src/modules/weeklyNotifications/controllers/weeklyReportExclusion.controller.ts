import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as service from "../services/weeklyReportExclusion.service.js";
import { parseQuery } from "../validators/missingExpense.validators.js";
import { listExclusionsQuerySchema, type CreateExclusionBody } from "../validators/weeklyReportExclusion.validators.js";

/** GET / - Excluded History of one report (Administrators only; re-checked in the service). */
export const listReportExclusions = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  res.status(200).json({ success: true, data: await service.listExclusions(user.sub, parseQuery(listExclusionsQuerySchema, req.query)) });
});

/** POST / - exclude a project from one weekly report. */
export const createReportExclusion = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const exclusion = await service.excludeProject(user.sub, req.body as CreateExclusionBody);
  res.status(201).json({ success: true, data: exclusion, message: `Project ${exclusion.prNo} excluded from "${exclusion.reportName}".` });
});

/** POST /:id/restore - include the project in its report again (the exclusion is kept in the history). */
export const restoreReportExclusion = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = String(req.params["id"] ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("Exclusion not found.", 404);
  const exclusion = await service.restoreExclusion(user.sub, id);
  res.status(200).json({ success: true, data: exclusion, message: `Project ${exclusion.prNo} included again in "${exclusion.reportName}".` });
});
