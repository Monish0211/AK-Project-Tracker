import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import type { NotificationCreateData, PushSubscriptionCreateData } from "./notification.types.js";

/**
 * All Prisma access for Notification/PushSubscription lives here — the
 * service layer never imports `prisma` directly (same rule as every other
 * module in this app). No business logic, no push-delivery decisions —
 * those live in notification.service.ts/webPush.service.ts.
 */

export function createNotification(data: NotificationCreateData & { actionUrl: string | null }) {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type,
      severity: data.severity ?? "Info",
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      actionUrl: data.actionUrl,
      ...(data.metadata != null && { metadata: data.metadata as Prisma.InputJsonValue }),
    },
  });
}

/** Ownership-scoped by construction — every caller always passes the authenticated user's own id, never a client-supplied one (see notification.controller.ts). */
export async function findNotificationsForUser(userId: string, skip: number, take: number) {
  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.notification.count({ where: { userId } }),
  ]);
  return { items, total };
}

export function countUnreadForUser(userId: string) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export function findNotificationById(id: string) {
  return prisma.notification.findUnique({ where: { id } });
}

export function markNotificationRead(id: string) {
  return prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
  });
}

export function markAllNotificationsReadForUser(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

/** One active (non-revoked) subscription per user, keyed by endpoint for the upsert below. */
export function findActiveSubscriptionsForUsers(userIds: string[]) {
  if (userIds.length === 0) return Promise.resolve([]);
  return prisma.pushSubscription.findMany({
    where: { userId: { in: userIds }, revokedAt: null },
  });
}

export function findSubscriptionByEndpoint(endpoint: string) {
  return prisma.pushSubscription.findUnique({ where: { endpoint } });
}

export function findSubscriptionById(id: string) {
  return prisma.pushSubscription.findUnique({ where: { id } });
}

/**
 * Create-or-reactivate by endpoint (unique) — a resubscribe from the same
 * browser/profile always produces the same endpoint, so this upserts rather
 * than risking a duplicate row. Reassigns userId on upsert too: the same
 * browser profile logging in as a different PortalUser must transfer the
 * subscription to the new owner, never silently keep notifying the old one.
 */
export function upsertSubscription(data: PushSubscriptionCreateData) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: data.endpoint },
    create: {
      userId: data.userId,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      userAgent: data.userAgent ?? null,
      deviceLabel: data.deviceLabel ?? null,
    },
    update: {
      userId: data.userId,
      p256dh: data.p256dh,
      auth: data.auth,
      userAgent: data.userAgent ?? null,
      deviceLabel: data.deviceLabel ?? null,
      revokedAt: null,
    },
  });
}

export function deleteSubscription(id: string) {
  return prisma.pushSubscription.delete({ where: { id } });
}

/** Backs webPush.service.ts's 404/410 handling — never a delete, so a later resubscribe from the same browser cleanly reactivates via upsertSubscription() above. */
export function revokeSubscription(id: string) {
  return prisma.pushSubscription.update({ where: { id }, data: { revokedAt: new Date() } });
}

/**
 * Priority #6 Phase 3B — every active PortalUser currently granted access to
 * the named Module. Used to resolve the recipient set for a business-event
 * notification (e.g. "everyone with Timesheets access") — the same
 * data-driven module-grant model every other feature in this app already
 * uses, never a bespoke notification-recipient permission of its own. A
 * plain read, no business logic (matches this file's own "no business
 * logic" rule stated at the top).
 */
export async function findUserIdsWithModuleAccess(moduleName: string): Promise<string[]> {
  const rows = await prisma.userModuleAccess.findMany({
    where: { module: { name: moduleName }, user: { isActive: true } },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}
