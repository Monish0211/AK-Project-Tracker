import { prisma } from "../../../shared/utils/prismaClient.js";
import type { Prisma } from "../../../../generated/prisma/client.js";
import type { projectOwnershipWhereOr } from "../../../shared/utils/projectAccess.js";

export function createReminder(
  projectId: string,
  data: {
    projectCode: string;
    title: string;
    description?: string | null;
    reminderType: string;
    priority: string;
    status: string;
    reminderDate: Date;
    reminderTime: string;
    notifyOffset: string;
    repeat: string;
    metadata?: unknown;
  },
  createdBy: string,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;
  return client.projectReminder.create({
    data: {
      projectId,
      projectCode: data.projectCode,
      title: data.title,
      description: data.description ?? null,
      reminderType: data.reminderType,
      priority: data.priority,
      status: data.status,
      reminderDate: data.reminderDate,
      reminderTime: data.reminderTime,
      notifyOffset: data.notifyOffset,
      repeat: data.repeat,
      createdBy,
      ...(data.metadata !== undefined && { metadata: data.metadata as Prisma.InputJsonValue }),
    },
  });
}

/**
 * The "same logical reminder" check for createReminderForProject()'s
 * idempotency guard — see that function's own comment for the full
 * rationale. A reminder is considered a duplicate of an existing one for
 * this project only when its title, full reminderDate, reminderTime, AND
 * repeat rule all match exactly; nothing else (priority, description,
 * notifyOffset, completion state) is compared, so two reminders that merely
 * share a similar title or time-of-day on different dates are never
 * conflated. Must be called inside the same advisory-locked transaction as
 * the eventual create (tx required, not optional) — otherwise two
 * concurrent callers could both see "no match" and both insert.
 */
export function findMatchingReminder(
  projectId: string,
  match: { title: string; reminderDate: Date; reminderTime: string; repeat: string },
  tx: Prisma.TransactionClient
) {
  return tx.projectReminder.findFirst({
    where: {
      projectId,
      title: match.title,
      reminderDate: match.reminderDate,
      reminderTime: match.reminderTime,
      repeat: match.repeat,
    },
    orderBy: { createdAt: "asc" },
  });
}

export function getRemindersByProjectId(projectId: string) {
  return prisma.projectReminder.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
}

/** Includes the parent project's createdByUserId — id-scoped update/delete callers (no projectId in the URL) need this to run the same project-ownership check as every other child-resource module. */
export function getReminderById(id: string) {
  return prisma.projectReminder.findUnique({
    where: { id },
    include: { project: { select: { createdByUserId: true, pmoCoordinatorUserId: true } } },
  });
}

export function updateReminder(id: string, data: Prisma.ProjectReminderUpdateInput) {
  return prisma.projectReminder.update({ where: { id }, data });
}

export function deleteReminder(id: string) {
  return prisma.projectReminder.delete({ where: { id } });
}

/** Every reminder belonging to a project matching `whereOr` (see projectAccess.ts's projectOwnershipWhereOr) — powers the global GET /reminders the frontend's ReminderScheduler polls, since it must evaluate reminders across every project the caller can see, not just one. `undefined` (Administrator/PMO Manager) means no restriction. */
export function getAllRemindersForCaller(whereOr: Awaited<ReturnType<typeof projectOwnershipWhereOr>>) {
  return prisma.projectReminder.findMany({
    ...(whereOr && { where: { project: { OR: whereOr } } }),
    orderBy: { createdAt: "desc" },
  });
}
