import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { pollKekaMailbox } from "../services/mailPoll.service.js";

/** POST /internal/timesheets/poll — triggered by whatever scheduling mechanism Stage 4 §16/§19 lands on (an in-process timer, or an external Hostinger cron hitting this endpoint). Protected by verifyInternalSecret, not authenticate/authorize. */
export const triggerPoll = asyncHandler(async (_req: Request, res: Response) => {
  const result = await pollKekaMailbox();
  res.status(200).json({ success: true, data: result });
});
