import type { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { AppError } from "../../shared/utils/AppError.js";
import { requireUser } from "../../shared/utils/requireUser.js";
import * as notificationService from "./notification.service.js";
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  pushSubscriptionIdParamSchema,
} from "./notification.validators.js";
import type { CreatePushSubscriptionInput } from "./notification.validators.js";

// Path params/query aren't covered by the shared `validate()` middleware
// (body only) — same manual-safeParse convention as every other controller
// in this app (see timesheet.controller.ts's parseEntryIdParam).
function parseNotificationIdParam(req: Request): string {
  const result = notificationIdParamSchema.safeParse(req.params);
  if (!result.success) throw new AppError("Notification ID is required.", 400);
  return result.data.id;
}

function parsePushSubscriptionIdParam(req: Request): string {
  const result = pushSubscriptionIdParamSchema.safeParse(req.params);
  if (!result.success) throw new AppError("Push subscription ID is required.", 400);
  return result.data.id;
}

/**
 * Every handler below derives the acting user from req.user.sub — never
 * from req.params/req.body/req.query — so a caller can never read, mark
 * read, or manage another PortalUser's notifications/subscriptions (Phase 2
 * spec §8). There is deliberately no Administrator bypass here: personal
 * notifications are exactly that, personal, regardless of role.
 */

export const getPushConfig = asyncHandler(async (_req: Request, res: Response) => {
  const config = notificationService.getPushConfig();
  res.status(200).json({ success: true, data: config });
});

export const createPushSubscription = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const subscription = await notificationService.registerPushSubscription(
    user.sub,
    req.body as CreatePushSubscriptionInput
  );
  res.status(201).json({ success: true, data: subscription, message: "Push subscription registered." });
});

export const deletePushSubscription = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parsePushSubscriptionIdParam(req);
  await notificationService.deletePushSubscription(id, user.sub);
  res.status(200).json({ success: true, message: "Push subscription removed." });
});

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const parsed = listNotificationsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError("Invalid query parameters.", 400);

  const result = await notificationService.listNotificationsForUser(user.sub, parsed.data.page, parsed.data.pageSize);
  res.status(200).json({ success: true, data: result });
});

export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await notificationService.getUnreadCountForUser(user.sub);
  res.status(200).json({ success: true, data: result });
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseNotificationIdParam(req);
  const updated = await notificationService.markNotificationAsRead(id, user.sub);
  res.status(200).json({ success: true, data: updated, message: "Notification marked as read." });
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await notificationService.markAllNotificationsAsRead(user.sub);
  res.status(200).json({ success: true, data: result, message: `${result.updatedCount} notification(s) marked as read.` });
});
