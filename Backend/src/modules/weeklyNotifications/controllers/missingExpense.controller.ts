import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as service from "../services/missingExpense.service.js";
import type { UpdateMissingExpenseRecipientsBody } from "../validators/missingExpense.validators.js";

export const getMissingExpenseSettings = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await service.getSettingsView() });
});

export const updateMissingExpenseRecipients = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const recipients = await service.updateRecipients(req.body as UpdateMissingExpenseRecipientsBody, user.sub);
  res.status(200).json({ success: true, data: recipients, message: "Weekly email recipients saved." });
});

export const getMissingExpenseUserOptions = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: { items: await service.listUserOptions() } });
});

export const previewMissingExpenseReport = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await service.previewReport() });
});

/** Manual trigger — 403 unless MISSING_EXPENSE_MANUAL_TRIGGER_ENABLED is "true" (off by default, so off in production). */
export const runMissingExpenseJobNow = asyncHandler(async (req: Request, res: Response) => {
  if (!service.isManualTriggerEnabled()) {
    throw new AppError("Manual runs are disabled on this server (MISSING_EXPENSE_MANUAL_TRIGGER_ENABLED).", 403);
  }
  const user = requireUser(req);
  const mode = (req.body as { mode: "manual" | "retry-weekly" }).mode;
  console.log(`[MissingExpenseNotification] Manual trigger (mode=${mode}) requested by user ${user.sub}.`);
  const result = await service.runMissingExpenseJob({ trigger: mode === "manual" ? "manual" : "scheduled" });
  res.status(200).json({ success: true, data: result });
});
