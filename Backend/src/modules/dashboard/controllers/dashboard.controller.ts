import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import { resolveProjectReadScope } from "../../../shared/utils/projectAccess.js";
import { getDashboardSummary } from "../services/dashboard.service.js";

/**
 * GET /dashboard/summary — same ownership split as GET /projects
 * (callerUserId undefined for Administrator/PMO Manager — see
 * hasUnrestrictedProjectVisibility()).
 */
export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const callerUserId = await resolveProjectReadScope(user);
  const data = await getDashboardSummary(callerUserId);
  res.status(200).json({ success: true, data });
});
