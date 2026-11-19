import { z } from "zod";
import { REMINDER_TYPES } from "./countryReminder.rules.js";

export const regionIdParam = z.object({ regionId: z.string().uuid("regionId must be a valid id.") });
export const settingParams = z.object({ regionId: z.string().uuid(), type: z.enum(REMINDER_TYPES) });

export const updateSettingSchema = z.object({ enabled: z.boolean() }).strict();
export type UpdateSettingBody = z.infer<typeof updateSettingSchema>;

const priority = z.enum(["Low", "Normal", "High", "Critical"]);
const time = z.string().trim().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "The time must be HH:mm.");
const date = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "The date must be YYYY-MM-DD.");

export const createCountryReminderSchema = z.object({
  regionId: z.string().uuid("Choose the country this reminder belongs to."),
  title: z.string().trim().min(1, "A title is required.").max(200),
  description: z.string().trim().max(2000).optional(),
  reminderDate: date,
  reminderTime: time.optional(),
  priority: priority.default("Normal"),
});
export type CreateCountryReminderBody = z.infer<typeof createCountryReminderSchema>;

export const updateCountryReminderSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  reminderDate: date.optional(),
  reminderTime: time.nullable().optional(),
  priority: priority.optional(),
  isCompleted: z.boolean().optional(),
});
export type UpdateCountryReminderBody = z.infer<typeof updateCountryReminderSchema>;

export const listCountryRemindersQuery = z.object({
  includeCompleted: z.enum(["true", "false"]).default("false"),
  regionId: z.string().uuid().optional(),
});
export const idParam = z.object({ id: z.string().uuid() });
