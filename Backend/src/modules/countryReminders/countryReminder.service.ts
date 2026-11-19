import { prisma } from "../../shared/utils/prismaClient.js";
import { AppError } from "../../shared/utils/AppError.js";
import { buildCountryContext, resolveCountryScope } from "../../shared/utils/countryAccess.js";
import type { AccessTokenPayload } from "../../shared/types/auth.types.js";
import { assertUserHoldsRegion } from "./countryReminderSetting.service.js";
import type { CreateCountryReminderBody, UpdateCountryReminderBody } from "./countryReminder.validators.js";

/**
 * Important reminders that belong to ONE country (not to a project). Every row names its Region; nothing is inferred from a PR number, an employee or a client.
 *
 * Who sees what is decided from the user's CURRENT grants, read from the database on every call, then narrowed by the country they have selected (the X-Active-Country header,
 * validated: a country they do not hold is a 403, never silently ignored). A user with no country sees nothing. This does not depend on COUNTRY_ACCESS_MODE: these reminders are
 * country data from the day they exist. Writing needs the Administrator or PMO Manager role (the route) AND holding the reminder's country (here).
 */

/** The country ids this request may read: the user's grants, narrowed to the selected country. */
export async function visibleRegionIds(userId: string, activeCountryHeader: string | string[] | undefined): Promise<string[]> {
  const ctx = await buildCountryContext(userId, activeCountryHeader, "enforce");
  const scope = resolveCountryScope(ctx); // 403 for a country the user does not hold
  if (scope.unrestricted) return (await prisma.region.findMany({ where: { isActive: true }, select: { id: true } })).map((r) => r.id);
  const selectable = new Set(ctx.selectable.map((r) => r.id));
  return scope.regionIds.filter((id) => selectable.has(id));
}

const toDto = (r: { id: string; regionId: string; region: { code: string | null; name: string; displayName: string | null }; title: string; description: string | null; reminderDate: Date; reminderTime: string | null; priority: string; isCompleted: boolean; completedAt: Date | null; createdByName: string; createdAt: Date; updatedAt: Date }) => ({
  id: r.id,
  regionId: r.regionId,
  countryCode: r.region.code,
  country: r.region.displayName?.trim() || r.region.name,
  title: r.title,
  description: r.description,
  reminderDate: r.reminderDate.toISOString().slice(0, 10),
  reminderTime: r.reminderTime,
  priority: r.priority,
  isCompleted: r.isCompleted,
  completedAt: r.completedAt?.toISOString() ?? null,
  createdBy: r.createdByName,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const INCLUDE = { region: { select: { code: true, name: true, displayName: true } } } as const;

export async function listCountryReminders(user: AccessTokenPayload, activeCountryHeader: string | string[] | undefined, query: { includeCompleted: boolean; regionId?: string | undefined }) {
  let regionIds = await visibleRegionIds(user.sub, activeCountryHeader);
  if (query.regionId) {
    if (!regionIds.includes(query.regionId)) throw new AppError("You do not have access to this country.", 403);
    regionIds = [query.regionId];
  }
  if (regionIds.length === 0) return { items: [] };
  const rows = await prisma.countryReminder.findMany({
    where: { regionId: { in: regionIds }, ...(query.includeCompleted ? {} : { isCompleted: false }) },
    include: INCLUDE,
    orderBy: [{ reminderDate: "asc" }, { reminderTime: "asc" }, { createdAt: "asc" }],
  });
  return { items: rows.map(toDto) };
}

export async function createCountryReminder(user: AccessTokenPayload, body: CreateCountryReminderBody) {
  await assertUserHoldsRegion(user, body.regionId);
  const actor = await prisma.portalUser.findUnique({ where: { id: user.sub }, select: { fullName: true } });
  const row = await prisma.countryReminder.create({
    data: {
      regionId: body.regionId,
      title: body.title,
      description: body.description ?? null,
      reminderDate: new Date(`${body.reminderDate}T00:00:00.000Z`),
      reminderTime: body.reminderTime ?? null,
      priority: body.priority,
      createdByUserId: user.sub,
      createdByName: actor?.fullName ?? user.email,
    },
    include: INCLUDE,
  });
  return toDto(row);
}

async function loadHeldReminder(user: AccessTokenPayload, id: string) {
  const row = await prisma.countryReminder.findUnique({ where: { id }, include: INCLUDE });
  // An unknown id and a reminder of a country the caller does not hold read the same: nothing about it is revealed.
  if (!row) throw new AppError("Country reminder not found.", 404);
  try {
    await assertUserHoldsRegion(user, row.regionId);
  } catch {
    throw new AppError("Country reminder not found.", 404);
  }
  return row;
}

export async function updateCountryReminder(user: AccessTokenPayload, id: string, body: UpdateCountryReminderBody) {
  await loadHeldReminder(user, id);
  const row = await prisma.countryReminder.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.reminderDate !== undefined && { reminderDate: new Date(`${body.reminderDate}T00:00:00.000Z`) }),
      ...(body.reminderTime !== undefined && { reminderTime: body.reminderTime }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.isCompleted !== undefined && { isCompleted: body.isCompleted, completedAt: body.isCompleted ? new Date() : null }),
    },
    include: INCLUDE,
  });
  return toDto(row);
}

export async function deleteCountryReminder(user: AccessTokenPayload, id: string): Promise<void> {
  await loadHeldReminder(user, id);
  await prisma.countryReminder.delete({ where: { id } });
}
