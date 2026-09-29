import { z } from "zod";

/**
 * priority/status/repeat/reminderType/notifyOffset are deliberately plain
 * z.string() (not z.enum(...)) — same convention as Project.projectStatus/
 * workOrderStatus. The frontend's own dropdowns already constrain these for
 * new reminders; a strict enum here risks rejecting a legacy value from an
 * existing localStorage reminder being migrated in (see
 * frontend/src/types/ProjectReminder.ts's NOTIFY_OFFSET_MINUTES "legacy
 * values from the earlier day-only offset model" comment) — this module's
 * job is durable persistence, not tightening validation beyond what the UI
 * already enforces.
 */
export const createReminderSchema = z.object({
  projectCode: z.string().trim().min(1, "Project code is required."),
  title: z.string().trim().min(1, "Title is required.").max(500, "Title is too long."),
  description: z.string().trim().max(4000, "Description is too long.").optional().nullable(),
  reminderType: z.string().trim().min(1, "Reminder type is required."),
  priority: z.string().trim().min(1, "Priority is required."),
  status: z.string().trim().min(1).default("Pending"),
  reminderDate: z.coerce.date(),
  reminderTime: z.string().trim().min(1, "Reminder time is required."),
  notifyOffset: z.string().trim().min(1, "Notify offset is required."),
  repeat: z.string().trim().min(1).default("None"),
  metadata: z.unknown().optional(),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;

/**
 * Same fields as createReminderSchema, all optional — a PATCH only carries
 * what changed. Also accepts the completion/notification bookkeeping fields
 * the scheduler and ReminderCard's complete/reopen actions write.
 */
export const updateReminderSchema = z.object({
  projectCode: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  reminderType: z.string().trim().min(1).optional(),
  priority: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  reminderDate: z.coerce.date().optional(),
  reminderTime: z.string().trim().min(1).optional(),
  notifyOffset: z.string().trim().min(1).optional(),
  repeat: z.string().trim().min(1).optional(),
  isCompleted: z.boolean().optional(),
  completedDate: z.coerce.date().optional().nullable(),
  notificationGenerated: z.boolean().optional(),
  triggeredAt: z.coerce.date().optional().nullable(),
  metadata: z.unknown().optional(),
});

export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;

/** Path params aren't covered by the shared validate() middleware (body only) — same manual-safeParse convention as milestone.controller.ts. */
export const projectIdParamSchema = z.object({ projectId: z.string().trim().min(1) });
export const reminderIdParamSchema = z.object({ id: z.string().trim().min(1) });
