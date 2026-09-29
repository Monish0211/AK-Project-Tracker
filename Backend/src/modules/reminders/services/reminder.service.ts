import type { Prisma } from "../../../../generated/prisma/client.js";
import { AppError } from "../../../shared/utils/AppError.js";
import {
  assertProjectAccess,
  assertProjectAccessById,
  hasUnrestrictedProjectVisibility,
  projectOwnershipWhereOr,
} from "../../../shared/utils/projectAccess.js";
import { getUserDisplayName } from "../../../shared/utils/userDisplayName.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import {
  createReminder,
  deleteReminder,
  findMatchingReminder,
  getAllRemindersForCaller,
  getReminderById,
  getRemindersByProjectId,
  updateReminder,
} from "../repository/reminder.repository.js";
import type { CreateReminderInput, UpdateReminderInput } from "../validators/reminder.validators.js";
import type { ReminderDto } from "../dto/reminder.dto.js";

function toReminderDto(reminder: {
  id: string;
  projectId: string;
  projectCode: string;
  title: string;
  description: string | null;
  reminderType: string;
  priority: string;
  status: string;
  reminderDate: Date;
  reminderTime: string;
  notifyOffset: string;
  repeat: string;
  createdBy: string;
  isCompleted: boolean;
  completedDate: Date | null;
  notificationGenerated: boolean;
  triggeredAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): ReminderDto {
  return {
    id: reminder.id,
    projectId: reminder.projectId,
    projectCode: reminder.projectCode,
    title: reminder.title,
    description: reminder.description,
    reminderType: reminder.reminderType,
    priority: reminder.priority,
    status: reminder.status,
    reminderDate: reminder.reminderDate,
    reminderTime: reminder.reminderTime,
    notifyOffset: reminder.notifyOffset,
    repeat: reminder.repeat,
    createdBy: reminder.createdBy,
    isCompleted: reminder.isCompleted,
    completedDate: reminder.completedDate,
    notificationGenerated: reminder.notificationGenerated,
    triggeredAt: reminder.triggeredAt,
    metadata: reminder.metadata,
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt,
  };
}

export async function listRemindersForProject(projectId: string, user: AccessTokenPayload) {
  await assertProjectAccessById(projectId, user);
  const reminders = await getRemindersByProjectId(projectId);
  return { items: reminders.map(toReminderDto) };
}

/**
 * Every reminder belonging to a project the caller may see — powers the
 * frontend's global ReminderScheduler, which (unlike Quantity/Milestones/
 * Invoices/Expenses/Notes) must evaluate pending reminders across every
 * project at once, not just whichever one is currently open in Edit/View
 * Project. Reuses the exact same project-visibility scoping already proven
 * for GET /projects — never a second, independently-drifting authorization
 * rule.
 */
export async function listAllRemindersForCaller(user: AccessTokenPayload) {
  const callerUserId = hasUnrestrictedProjectVisibility(user.roleName) ? undefined : user.sub;
  const whereOr = await projectOwnershipWhereOr(callerUserId);
  const reminders = await getAllRemindersForCaller(whereOr);
  return { items: reminders.map(toReminderDto) };
}

/**
 * Acquire the project-scoped advisory lock for the reminder-creation
 * idempotency check below — same hashtext()-keyed pattern as
 * invoice.service.ts's lockQuantityItemForInvoiceWrite(). Must be the first
 * statement inside the transaction so the "does an identical reminder
 * already exist" read and the eventual insert can never straddle a
 * concurrent duplicate request for this same project.
 */
async function lockProjectForReminderCreate(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
}

/**
 * Sept 2026 — duplicate reminder fix. Production showed the exact same
 * reminder (title/date/time/repeat all identical) inserted three times for
 * one project within ~9 seconds. Root cause: the frontend's Workspace
 * drawer re-invokes ReminderService.loadRemindersForProject() every time
 * it's opened, which migrates a still-present legacy local-only reminder by
 * POSTing it here — and nothing previously stopped two overlapping
 * invocations (the same tab reopened quickly, or two tabs/devices open on
 * the same project) from both observing "no backend reminder yet" and both
 * creating one.
 *
 * Fixed with a lock-then-check-then-write transaction, mirroring the exact
 * pattern already used by invoice.service.ts/milestone.service.ts for this
 * same class of race — deliberately NOT a database UNIQUE constraint, which
 * would need to encode this same "what counts as the same reminder" rule at
 * the schema level and would reject an update path that never inserts
 * twice anyway. A reminder is treated as a duplicate of an existing one for
 * this project ONLY when its title, full reminderDate, reminderTime, and
 * repeat rule all match exactly (see findMatchingReminder()'s own comment)
 * — two reminders that merely share a similar title or time on a different
 * date are never conflated, and a genuinely new create for a project that
 * has no such match always inserts normally. When a match is found, the
 * EXISTING row is returned unchanged (never a second insert, never an
 * error) — safe for a retried/raced Save action, indistinguishable from
 * success to the caller either way.
 */
export async function createReminderForProject(
  projectId: string,
  input: CreateReminderInput,
  user: AccessTokenPayload
) {
  await assertProjectAccessById(projectId, user);

  // Never trusts a client-supplied name — always the current fullName for
  // the authenticated caller, same convention as Project Notes. No DB write
  // depends on concurrent sibling state, so this is safe to resolve outside
  // the locked transaction below.
  const createdBy = await getUserDisplayName(user.sub);

  const reminder = await prisma.$transaction(async (tx) => {
    await lockProjectForReminderCreate(tx, projectId);

    const existing = await findMatchingReminder(
      projectId,
      {
        title: input.title,
        reminderDate: input.reminderDate,
        reminderTime: input.reminderTime,
        repeat: input.repeat,
      },
      tx
    );
    if (existing) return existing;

    return createReminder(projectId, { ...input, description: input.description ?? null }, createdBy, tx);
  });

  return toReminderDto(reminder);
}

async function loadReminderOrThrow(id: string, user: AccessTokenPayload) {
  const existing = await getReminderById(id);
  if (!existing) {
    throw new AppError("Reminder not found.", 404);
  }
  await assertProjectAccess(user, existing.project);
  return existing;
}

// Only the fields the caller actually sent are included below — with
// exactOptionalPropertyTypes on, spreading `input` directly into
// Prisma.ProjectReminderUpdateInput would type each optional field as
// `T | undefined` instead of "present or absent", which Prisma's generated
// input types reject. Same pattern as milestone.service.ts's updateMilestoneItem().
export async function updateReminderItem(id: string, input: UpdateReminderInput, user: AccessTokenPayload) {
  await loadReminderOrThrow(id, user);
  const updated = await updateReminder(id, {
    ...(input.projectCode !== undefined && { projectCode: input.projectCode }),
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.reminderType !== undefined && { reminderType: input.reminderType }),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.reminderDate !== undefined && { reminderDate: input.reminderDate }),
    ...(input.reminderTime !== undefined && { reminderTime: input.reminderTime }),
    ...(input.notifyOffset !== undefined && { notifyOffset: input.notifyOffset }),
    ...(input.repeat !== undefined && { repeat: input.repeat }),
    ...(input.isCompleted !== undefined && { isCompleted: input.isCompleted }),
    ...(input.completedDate !== undefined && { completedDate: input.completedDate }),
    ...(input.notificationGenerated !== undefined && { notificationGenerated: input.notificationGenerated }),
    ...(input.triggeredAt !== undefined && { triggeredAt: input.triggeredAt }),
    ...(input.metadata !== undefined && { metadata: input.metadata as Prisma.InputJsonValue }),
  });
  return toReminderDto(updated);
}

export async function deleteReminderItem(id: string, user: AccessTokenPayload): Promise<void> {
  await loadReminderOrThrow(id, user);
  await deleteReminder(id);
}
