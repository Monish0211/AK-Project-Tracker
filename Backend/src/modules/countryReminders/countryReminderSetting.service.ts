import { prisma } from "../../shared/utils/prismaClient.js";
import { AppError } from "../../shared/utils/AppError.js";
import { loadCountryGrants } from "../../shared/utils/countryAccess.js";
import type { AccessTokenPayload } from "../../shared/types/auth.types.js";
import { defaultSetting, REMINDER_TYPE_LABEL, REMINDER_TYPES, type ReminderType, type SettingValue } from "./countryReminder.rules.js";
import type { UpdateSettingBody } from "./countryReminder.validators.js";

/**
 * Settings → Country Reminders: the per-country switch for project reminder alerts. Country authorization is decided HERE, from the user's CURRENT grants read from the
 * database on every call: not from the browser's country selector, not from the token, not from the Administrator / PMO Manager role (the route requires that role AND this
 * check passes). Every change is audited in the same transaction. The Weekly Emails are not configured here: they remain global (Settings → Weekly Emails).
 */

interface RegionRow {
  id: string;
  code: string | null;
  name: string;
  displayName: string | null;
}

const REGION_SELECT = { id: true, code: true, name: true, displayName: true } as const;

/** The active countries this user currently holds (every active country for the explicit All Countries right). */
async function regionsUserHolds(userId: string): Promise<RegionRow[]> {
  const grants = await loadCountryGrants(userId);
  const ids = grants.selectable.map((r) => r.id);
  if (ids.length === 0) return [];
  return prisma.region.findMany({ where: { id: { in: ids } }, select: REGION_SELECT, orderBy: { name: "asc" } });
}

export async function assertUserHoldsRegion(user: Pick<AccessTokenPayload, "sub">, regionId: string): Promise<RegionRow> {
  const region = (await regionsUserHolds(user.sub)).find((r) => r.id === regionId);
  if (!region) throw new AppError("You do not have access to this country.", 403);
  return region;
}

const asJson = (v: SettingValue): { enabled: boolean } => ({ enabled: v.enabled });
const displayName = (r: RegionRow): string => r.displayName?.trim() || r.name;

export async function listCountrySettings(user: AccessTokenPayload) {
  const regions = await regionsUserHolds(user.sub);
  const rows = regions.length === 0 ? [] : await prisma.countryReminderSetting.findMany({ where: { regionId: { in: regions.map((r) => r.id) } } });
  const byKey = new Map(rows.map((row) => [`${row.regionId}|${row.reminderType}`, row]));
  return {
    countries: regions.map((r) => ({
      regionId: r.id,
      code: r.code,
      name: displayName(r),
      settings: REMINDER_TYPES.map((type) => {
        const row = byKey.get(`${r.id}|${type}`);
        return { type, label: REMINDER_TYPE_LABEL[type], isDefault: !row, enabled: row ? row.enabled : defaultSetting(type).enabled, updatedAt: row?.updatedAt.toISOString() ?? null };
      }),
    })),
  };
}

export async function updateCountrySetting(user: AccessTokenPayload, regionId: string, type: ReminderType, body: UpdateSettingBody) {
  await assertUserHoldsRegion(user, regionId);
  const actor = await prisma.portalUser.findUnique({ where: { id: user.sub }, select: { fullName: true } });
  const saved = await prisma.$transaction(async (tx) => {
    const existing = await tx.countryReminderSetting.findUnique({ where: { regionId_reminderType: { regionId, reminderType: type } } });
    const row = await tx.countryReminderSetting.upsert({
      where: { regionId_reminderType: { regionId, reminderType: type } },
      create: { regionId, reminderType: type, enabled: body.enabled, updatedByUserId: user.sub },
      update: { enabled: body.enabled, updatedByUserId: user.sub },
    });
    await tx.countryReminderSettingAudit.create({
      data: {
        regionId,
        reminderType: type,
        actorUserId: user.sub,
        actorName: actor?.fullName ?? user.email,
        previousValue: asJson(existing ? { enabled: existing.enabled } : defaultSetting(type)),
        newValue: asJson({ enabled: row.enabled }),
      },
    });
    return row;
  });
  return { regionId, type, label: REMINDER_TYPE_LABEL[type], isDefault: false, enabled: saved.enabled, updatedAt: saved.updatedAt.toISOString() };
}

export async function listSettingAudit(user: AccessTokenPayload, regionId: string, limit = 50) {
  await assertUserHoldsRegion(user, regionId);
  const rows = await prisma.countryReminderSettingAudit.findMany({ where: { regionId }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 200) });
  return {
    items: rows.map((r) => ({ id: r.id, reminderType: r.reminderType, actorName: r.actorName, previousValue: r.previousValue, newValue: r.newValue, changedAt: r.createdAt.toISOString() })),
  };
}
