import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as milestoneService from "../services/milestone.service.js";
import { milestoneIdParamSchema, projectIdParamSchema } from "../validators/milestone.validators.js";
import type { CreateMilestoneInput, IngestMilestonesInput, UpdateMilestoneInput } from "../validators/milestone.validators.js";

// Path params aren't covered by the shared `validate()` middleware (body
// only) — same manual-safeParse convention as quantity.controller.ts.
function parseProjectIdParam(req: Request): string {
  const result = projectIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Project ID is required.", 400);
  }
  return result.data.projectId;
}

function parseMilestoneIdParam(req: Request): string {
  const result = milestoneIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Milestone ID is required.", 400);
  }
  return result.data.id;
}

export const createMilestone = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = parseProjectIdParam(req);
  const milestone = await milestoneService.createMilestoneForProject(projectId, req.body as CreateMilestoneInput, user);
  res.status(201).json({ success: true, data: milestone, message: "Milestone created successfully." });
});

export const getMilestonesByProject = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = parseProjectIdParam(req);
  const result = await milestoneService.listMilestonesForProject(projectId, user);
  res.status(200).json({ success: true, data: result });
});

export const updateMilestone = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseMilestoneIdParam(req);
  const milestone = await milestoneService.updateMilestoneItem(id, req.body as UpdateMilestoneInput, user);
  res.status(200).json({ success: true, data: milestone, message: "Milestone updated successfully." });
});

export const deleteMilestone = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseMilestoneIdParam(req);
  await milestoneService.deleteMilestoneItem(id, user);
  res.status(200).json({ success: true, data: null, message: "Milestone deleted successfully." });
});

// Ingest — legacy-migration / future-Import only. See milestone.service.ts's
// ingestMilestonesForProject() for the id-preservation rationale.
export const ingestMilestones = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = parseProjectIdParam(req);
  const result = await milestoneService.ingestMilestonesForProject(projectId, req.body as IngestMilestonesInput, user);
  res.status(201).json({
    success: true,
    data: result,
    message: `${result.items.length} milestone(s) ingested successfully.`,
  });
});
