import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import { getTimesheetPendingProjects } from "../services/timesheetPending.service.js";

/**
 * GET /timesheets/pending-projects — the single backend source of truth
 * for "Timesheet Pending" (see timesheetPending.service.ts for the
 * confirmed business rule). Replaces the previous frontend-only,
 * localStorage-derived calculation. Returns only currently-PENDING
 * projects, matching that calculation's exact prior behavior — scoped to
 * projects the caller is authorized for (Administrator sees all).
 */
export const getPendingProjects = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const callerUserId = user.roleName === "Administrator" ? undefined : user.sub;
  const items = await getTimesheetPendingProjects(callerUserId);
  res.status(200).json({ success: true, data: { items } });
});
