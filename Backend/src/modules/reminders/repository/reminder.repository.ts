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
    dueAt?: Date | null;
    timeZone?: string | null;
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
      dueAt: data.dueAt ?? null,
      timeZone: data.timeZone ?? null,
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

/** The project's stored country, read with each listed reminder (one join, no extra query per row). */
export const REMINDER_PROJECT_COUNTRY = { project: { select: { regionId: true, region: { select: { name: true, displayName: true } } } } } as const;

export function getRemindersByProjectId(projectId: string) {
  return prisma.projectReminder.findMany({
    where: { projectId },
    include: REMINDER_PROJECT_COUNTRY,
    orderBy: { createdAt: "desc" },
  });
}

/** Includes the parent project's createdByUserId — id-scoped update/delete callers (no projectId in the URL) need this to run the same project-ownership check as every other child-resource module. */
export function getReminderById(id: string) {
  return prisma.projectReminder.findUnique({
    where: { id },
    include: { project: { select: { createdByUserId: true, pmoCoordinatorUserId: true, regionId: true, region: { select: { code: true, name: true } } } } },
  });
}

export function updateReminder(id: string, data: Prisma.ProjectReminderUpdateInput) {
  return prisma.projectReminder.update({ where: { id }, data });
}

export function deleteReminder(id: string) {
  return prisma.projectReminder.delete({ where: { id } });
}

/** Every reminder belonging to a project matching `whereOr` (see projectAccess.ts's projectOwnershipWhereOr) — powers the global GET /reminders the frontend's ReminderScheduler polls, since it must evaluate reminders across every project the caller can see, not just one. `undefined` (Administrator/PMO Manager) means no restriction. */
/** `mutedRegionIds`: countries whose "Project reminder alerts" are switched off in Settings → Country Reminders; their projects' reminders are not delivered. */
export function getAllRemindersForCaller(whereOr: Awaited<ReturnType<typeof projectOwnershipWhereOr>>, mutedRegionIds: string[] = []) {
  const muted = mutedRegionIds.length > 0 ? { OR: [{ regionId: null }, { regionId: { notIn: mutedRegionIds } }] } : undefined;
  const project = whereOr && muted ? { AND: [{ OR: whereOr }, muted] } : whereOr ? { OR: whereOr } : muted;
  return prisma.projectReminder.findMany({
    ...(project && { where: { project } }),
    include: REMINDER_PROJECT_COUNTRY,
    orderBy: { createdAt: "desc" },
  });
}
