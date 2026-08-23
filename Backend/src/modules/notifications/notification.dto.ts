/** Response/request shapes for the Notification module's REST surface. */

export interface NotificationDto {
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
}

/** GET /notifications — same {items, total, page, pageSize} shape as every other paginated list in this app (see employee.repository.ts's listEmployees, timesheet.dto.ts's TimesheetEntryListDto). */
export interface NotificationListDto {
  items: NotificationDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UnreadCountDto {
  count: number;
}

export interface PushSubscriptionDto {
  id: string;
  endpoint: string;
  createdAt: Date;
  updatedAt: Date;
}

/** POST /notifications/push-subscriptions — the exact shape the browser's PushSubscription.toJSON() produces. userId is deliberately absent: it always comes from req.user.sub, never the body. */
export interface CreatePushSubscriptionDto {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  deviceLabel?: string;
}

/** GET /notifications/push-config — the one non-secret value the frontend needs to call PushManager.subscribe(). */
export interface PushConfigDto {
  publicKey: string | null;
  configured: boolean;
}
