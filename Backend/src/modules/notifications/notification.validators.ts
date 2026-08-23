import { z } from "zod";

/**
 * GET /notifications query params — same page/pageSize convention as
 * listEmployeesQuerySchema/findEntriesQuerySchema (positive-int page,
 * capped pageSize). Parsed directly in the controller — the shared
 * `validate()` middleware only covers req.body.
 */
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const notificationIdParamSchema = z.object({
  id: z.string().trim().min(1, "Notification ID is required."),
});
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;

export const pushSubscriptionIdParamSchema = z.object({
  id: z.string().trim().min(1, "Push subscription ID is required."),
});
export type PushSubscriptionIdParam = z.infer<typeof pushSubscriptionIdParamSchema>;

/**
 * POST /notifications/push-subscriptions body — the literal shape
 * PushSubscription.toJSON() produces in the browser (endpoint + keys.p256dh
 * + keys.auth). userId is deliberately NOT part of this schema — it is
 * never accepted from the client (see notification.controller.ts, which
 * always uses req.user.sub).
 */
export const createPushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url("endpoint must be a valid URL."),
  keys: z.object({
    p256dh: z.string().trim().min(1, "keys.p256dh is required."),
    auth: z.string().trim().min(1, "keys.auth is required."),
  }),
  userAgent: z.string().trim().max(500).optional(),
  deviceLabel: z.string().trim().max(200).optional(),
});
export type CreatePushSubscriptionInput = z.infer<typeof createPushSubscriptionSchema>;
