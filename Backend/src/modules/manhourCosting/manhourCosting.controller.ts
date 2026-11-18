import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { AppError } from "../../shared/utils/AppError.js";
import { requireUser } from "../../shared/utils/requireUser.js";
import { uuidParamSchema } from "../../shared/utils/uuidParam.js";
import { getProjectManhourCosting } from "./manhourCostingRead.service.js";
import { listOpenRefreshRuns, retryRun } from "./manhourCostRefresh.service.js";

const projectIdParam = uuidParamSchema("projectId", "Project ID");
const runIdParam = uuidParamSchema("runId", "Run ID");

function parse<T extends z.ZodTypeAny>(schema: T, params: unknown, message: string): z.infer<T> {
  const result = schema.safeParse(params);
  if (!result.success) throw new AppError(message, 400);
  return result.data;
}

export const getCosting = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = parse(projectIdParam, req.params, "Project ID is required.");
  res.status(200).json({ success: true, data: await getProjectManhourCosting(projectId, requireUser(req)) });
});

export const getOpenRuns = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: { items: await listOpenRefreshRuns(requireUser(req)) } });
});

export const retry = asyncHandler(async (req: Request, res: Response) => {
  const { runId } = parse(runIdParam, req.params, "Run ID is required.");
  const data = await retryRun(runId);
  res.status(200).json({ success: true, data, message: data.status === "SUCCEEDED" ? "Recalculation completed for every project." : "Recalculation retried; some projects are still not current." });
});
