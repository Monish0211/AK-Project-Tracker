import { AppError } from "../../shared/utils/AppError.js";
import * as repo from "./notification.repository.js";
import { getPublicVapidKey, isWebPushConfigured, sendPushNotification } from "./webPush.service.js";
import type { NotificationDto, NotificationListDto, PushConfigDto, PushSubscriptionDto, UnreadCountDto } from "./notification.dto.js";
import type { NotificationEntityType, NotifyPayload } from "./notification.types.js";
import type { CreatePushSubscriptionInput } from "./notification.validators.js";

/**
 * Priority #6, Phase 2 — INFRASTRUCTURE ONLY. This module is the one and
 * only integration point any future business module should call
 * (`notify()` below) — no module should implement its own push/toast
 * logic (Phase 1 audit, §N). Deliberately NOT called from any business
 * service yet (mailPoll.service.ts, timesheet.service.ts, project.service.ts,
 * invoice.service.ts, quantity.service.ts, dashboard.service.ts, or any
 * Reports code) — that wiring is explicit future work (Phase 3), gated on
 * this infrastructure being verified first. Nothing in this file is
 * imported by, or imports, any business-calculation module.
 */

/**
 * Fixed, server-side allowlist mapping an entity reference to a real PMO
 * route — the ONLY way actionUrl is ever produced. A client-supplied raw
 * URL is never trusted (Phase 1 audit §14/§R) — entityType/entityId are the
 * only inputs, and an unsupported entityType yields a null actionUrl
 * (notification still persists and can still push, just with nothing to
 * navigate to) rather than being rejected outright, since the notification
 * itself is still a real, valid event even without a deep link.
 *
 * Deliberately minimal for this phase — only entity types with an already-
 * confirmed real PMO route are listed (matches the exact route strings the
 * existing local rule engine already uses — see
 * frontend/src/notifications/notificationRoutes.ts's PROJECT_EDIT/TIMESHEETS
 * constants). Extend this map only once a future entity type's real route
 * is confirmed — never guess a route shape.
 */
const ENTITY_ROUTE_BUILDERS: Partial<Record<NotificationEntityType, (entityId: string) => string>> = {
  Project: (id) => `/projects/edit/${id}`,
  TimesheetImport: () => `/timesheets`,
  // Priority #6 Phase 3B — there is no standalone invoice URL anywhere in
  // the frontend (confirmed by inspecting ViewProject.tsx: "Invoices" is one
  // tab of the project workspace, selected via in-memory React state, never
  // a URL — there is no route/query-param that can deep-link straight to
  // it). The only real, existing destination where a user can view invoice
  // information is the project workspace itself. Because buildActionUrl()
  // is synchronous and receives only entityId (no DB access, by design —
  // never rewritten for this), the one technically possible way to route
  // there is for an "Invoice" notification's entityId to BE the project's
  // id, not an invoice line's own id. This keeps entityType: "Invoice"
  // semantically correct (the notification is genuinely about an invoice
  // event) while entityId carries the project reference this builder
  // actually needs — see invoice.service.ts's notifyInvoiceStatusEvent().
  Invoice: (projectId) => `/projects/edit/${projectId}`,
};

function buildActionUrl(entityType: NotificationEntityType | null | undefined, entityId: string | null | undefined): string | null {
  if (!entityType || !entityId) return null;
  const builder = ENTITY_ROUTE_BUILDERS[entityType];
  return builder ? builder(entityId) : null;
}

function toNotificationDto(row: {
  id: string;
  title: string;
  message: string;
  type: string;
  severity: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
  metadata: unknown;
}): NotificationDto {
  return { ...row };
}

/**
 * The one function every future business module will call. Fire-and-forget
 * by design: catches its own errors, never throws back into the caller's
 * business transaction (Phase 1 audit §Q — a notification failure must
 * never roll back a Timesheet import, Project creation, Invoice operation,
 * or any other business operation). Persists a real Notification row for
 * EVERY target user unconditionally, THEN best-effort push-delivers to
 * their active subscriptions — a push failure (expired subscription, push
 * service down, user offline) never affects the persisted row (§18 of the
 * Phase 2 spec: the DB record always survives even when push doesn't).
 */
export async function notify(targetUserIds: string[], payload: NotifyPayload): Promise<void> {
  try {
    const actionUrl = buildActionUrl(payload.entityType, payload.entityId);

    const created = await Promise.all(
      targetUserIds.map((userId) =>
        repo.createNotification({
          userId,
          title: payload.title,
          message: payload.message,
          type: payload.type,
          ...(payload.severity !== undefined && { severity: payload.severity }),
          ...(payload.entityType !== undefined && { entityType: payload.entityType }),
          ...(payload.entityId !== undefined && { entityId: payload.entityId }),
          ...(payload.metadata !== undefined && { metadata: payload.metadata }),
          actionUrl,
        })
      )
    );

    if (!isWebPushConfigured()) return;

    const subscriptions = await repo.findActiveSubscriptionsForUsers(targetUserIds);
    if (subscriptions.length === 0) return;

    const pushPayload = {
      title: payload.title,
      body: payload.message,
      actionUrl,
    };

    await Promise.all(
      subscriptions.map(async (sub) => {
        const outcome = await sendPushNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          pushPayload
        );
        // One dead subscription is revoked independently — never allowed to
        // affect delivery to any other subscription (Phase 2 spec §6/§18).
        if (!outcome.ok && outcome.expired) {
          await repo.revokeSubscription(sub.id).catch(() => {
            // Best-effort — a revoke failure here is not worth surfacing;
            // the next send attempt against this same dead endpoint will
            // simply fail again and retry the revoke.
          });
        }
      })
    );

    void created; // rows already persisted above regardless of push outcome
  } catch (err) {
    // Never rethrown — see this function's own doc comment. Logged only.
    console.error("[NotificationService] notify() failed (business transaction is unaffected):", err);
  }
}

export async function listNotificationsForUser(userId: string, page: number, pageSize: number): Promise<NotificationListDto> {
  const skip = (page - 1) * pageSize;
  const { items, total } = await repo.findNotificationsForUser(userId, skip, pageSize);
  return { items: items.map(toNotificationDto), total, page, pageSize };
}

export async function getUnreadCountForUser(userId: string): Promise<UnreadCountDto> {
  const count = await repo.countUnreadForUser(userId);
  return { count };
}

/** Throws 404 if the notification doesn't exist OR belongs to another user — identical external behavior either way, so a caller can never learn whether an id exists at all if it isn't theirs (same "not found, not forbidden" precedent as every other ownership check in this app). */
export async function markNotificationAsRead(id: string, userId: string): Promise<NotificationDto> {
  const existing = await repo.findNotificationById(id);
  if (!existing || existing.userId !== userId) {
    throw new AppError("Notification not found.", 404);
  }
  const updated = await repo.markNotificationRead(id);
  return toNotificationDto(updated);
}

export async function markAllNotificationsAsRead(userId: string): Promise<{ updatedCount: number }> {
  const result = await repo.markAllNotificationsReadForUser(userId);
  return { updatedCount: result.count };
}

export function getPushConfig(): PushConfigDto {
  return { publicKey: getPublicVapidKey(), configured: isWebPushConfigured() };
}

/** Create-or-reactivate — see notification.repository.ts's upsertSubscription() for why this is an upsert keyed by endpoint, not a plain create. */
export async function registerPushSubscription(userId: string, input: CreatePushSubscriptionInput): Promise<PushSubscriptionDto> {
  const row = await repo.upsertSubscription({
    userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: input.userAgent ?? null,
    deviceLabel: input.deviceLabel ?? null,
  });
  return { id: row.id, endpoint: row.endpoint, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

/** Throws 404 if the subscription doesn't exist OR belongs to another user — same "not found, not forbidden" precedent as markNotificationAsRead() above. */
export async function deletePushSubscription(id: string, userId: string): Promise<void> {
  const existing = await repo.findSubscriptionById(id);
  if (!existing || existing.userId !== userId) {
    throw new AppError("Push subscription not found.", 404);
  }
  await repo.deleteSubscription(id);
}

/**
 * Priority #6 Phase 3B — recipient resolution for business-event
 * notifications. Deliberately separate from notify() itself (which stays
 * exactly as verified in Phase 2/3A) — every business-module caller resolves
 * WHO to notify via these two functions before calling notify(), so the
 * "how do we pick recipients" rule lives in exactly one place.
 */

/** Every active PortalUser holding the named Module's access grant — the fallback audience for a system-wide or ownerless-project event. Never guesses from free-text fields (project manager/coordinator names are not PortalUser references — see the Phase 3B audit). */
export async function resolveModuleRecipients(moduleName: string): Promise<string[]> {
  return repo.findUserIdsWithModuleAccess(moduleName);
}

/** Project-scoped event recipient rule, approved Phase 3B: the project's real creator (a genuine PortalUser FK) if one is recorded, otherwise every active user holding the given fallback module's access. */
export async function resolveProjectEventRecipients(
  createdByUserId: string | null,
  fallbackModuleName: string
): Promise<string[]> {
  if (createdByUserId) return [createdByUserId];
  return repo.findUserIdsWithModuleAccess(fallbackModuleName);
}
