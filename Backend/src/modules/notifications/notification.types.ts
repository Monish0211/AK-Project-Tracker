/**
 * Shared shapes reused across the Notification module's layers (repository,
 * service, controller) — mirrors resource.types.ts's ProjectResourceData's
 * role: the one shape every layer of this module agrees on.
 */

/**
 * A fixed, server-side allowlist of entity types a notification may
 * reference — see notification.service.ts's buildActionUrl(). A caller
 * supplies entityType/entityId only; actionUrl is always derived from this
 * list, never accepted as a raw URL, so nothing can inject an arbitrary or
 * external link into a notification.
 */
export type NotificationEntityType = "Project" | "TimesheetImport" | "Invoice" | "Expense";

export interface NotificationCreateData {
  userId: string;
  title: string;
  message: string;
  type: string;
  severity?: string;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** What NotificationService.notify() accepts — see its own module comment for the fire-and-forget/never-throws contract. */
export interface NotifyPayload {
  title: string;
  message: string;
  type: string;
  severity?: string;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionCreateData {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  deviceLabel?: string | null;
}
