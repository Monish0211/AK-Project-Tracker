import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { AppError } from "../../shared/utils/AppError.js";
import { requireUser } from "../../shared/utils/requireUser.js";
import { ACTIVE_COUNTRY_HEADER } from "../../shared/utils/countryAccess.js";
import * as settings from "./countryReminderSetting.service.js";
import * as reminders from "./countryReminder.service.js";
import {
  createCountryReminderSchema,
  idParam,
  listCountryRemindersQuery,
  regionIdParam,
  settingParams,
  updateCountryReminderSchema,
  updateSettingSchema,
} from "./countryReminder.validators.js";

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(issue ? issue.message : "Invalid request.", 400);
  }
  return result.data;
}

const send = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

// ── Settings → Country Reminders ──────────────────────────────────────────────────────────────────────────────────────────
export const listSettings = asyncHandler(async (req: Request, res: Response) => send(res, await settings.listCountrySettings(requireUser(req))));

export const updateSetting = asyncHandler(async (req: Request, res: Response) => {
  const { regionId, type } = parse(settingParams, req.params);
  send(res, await settings.updateCountrySetting(requireUser(req), regionId, type, parse(updateSettingSchema, req.body)));
});

export const listAudit = asyncHandler(async (req: Request, res: Response) => {
  const { regionId } = parse(regionIdParam, req.params);
  send(res, await settings.listSettingAudit(requireUser(req), regionId));
});


// ── Important country reminders ───────────────────────────────────────────────────────────────────────────────────────────
export const listReminders = asyncHandler(async (req: Request, res: Response) => {
  const query = parse(listCountryRemindersQuery, req.query);
  send(res, await reminders.listCountryReminders(requireUser(req), req.headers[ACTIVE_COUNTRY_HEADER], { includeCompleted: query.includeCompleted === "true", regionId: query.regionId }));
});

export const createReminder = asyncHandler(async (req: Request, res: Response) => send(res, await reminders.createCountryReminder(requireUser(req), parse(createCountryReminderSchema, req.body)), 201));

export const updateReminder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParam, req.params);
  send(res, await reminders.updateCountryReminder(requireUser(req), id, parse(updateCountryReminderSchema, req.body)));
});

export const deleteReminder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParam, req.params);
  await reminders.deleteCountryReminder(requireUser(req), id);
  res.status(200).json({ success: true, message: "Country reminder deleted." });
});
