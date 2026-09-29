import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as reminderService from "../services/reminder.service.js";
import { projectIdParamSchema, reminderIdParamSchema } from "../validators/reminder.validators.js";
import type { CreateReminderInput, UpdateReminderInput } from "../validators/reminder.validators.js";

// Path params aren't covered by the shared `validate()` middleware (body
// only) — same manual-safeParse convention as milestone.controller.ts.
function parseProjectIdParam(req: Request): string {
  const result = projectIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Project ID is required.", 400);
  }
  return result.data.projectId;
}

function parseReminderIdParam(req: Request): string {
  const result = reminderIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Reminder ID is required.", 400);
  }
  return result.data.id;
}

// Global — every reminder belonging to a project the caller may see. Powers
// the frontend's ReminderScheduler, which polls across every project at
// once, not just whichever one is open in Edit/View Project.
export const getAllReminders = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await reminderService.listAllRemindersForCaller(user);
  res.status(200).json({ success: true, data: result });
});

export const getRemindersByProject = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = parseProjectIdParam(req);
  const result = await reminderService.listRemindersForProject(projectId, user);
  res.status(200).json({ success: true, data: result });
});

export const createReminder = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = parseProjectIdParam(req);
  const reminder = await reminderService.createReminderForProject(projectId, req.body as CreateReminderInput, user);
  res.status(201).json({ success: true, data: reminder, message: "Reminder created successfully." });
});

export const updateReminder = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseReminderIdParam(req);
  const reminder = await reminderService.updateReminderItem(id, req.body as UpdateReminderInput, user);
  res.status(200).json({ success: true, data: reminder, message: "Reminder updated successfully." });
});

export const deleteReminder = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseReminderIdParam(req);
  await reminderService.deleteReminderItem(id, user);
  res.status(200).json({ success: true, data: null, message: "Reminder deleted successfully." });
});
