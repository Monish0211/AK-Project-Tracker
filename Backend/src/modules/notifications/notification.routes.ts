import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { denyReadOnlyWrites } from "../../shared/middleware/denyReadOnlyWrites.js";
import { requireModuleAccess } from "../../shared/middleware/requireModuleAccess.js";
import { validate } from "../../shared/middleware/validate.js";
import {
  createPushSubscription,
  deletePushSubscription,
  getNotifications,
  getPushConfig,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification.controller.js";
import { createPushSubscriptionSchema } from "./notification.validators.js";

const router = Router();

// Gated by the real, already-seeded "Notifications" Module (same row named
// in UserModuleAccess for every existing PortalUser grant) — the same
// pattern as every other feature area in this app, never a bespoke rule.
// Deliberately NO public POST /notifications/send anywhere in this file —
// per the approved Phase 1 design, event creation is a backend service
// call (notification.service.ts's notify()) only, never an HTTP endpoint.

router.get("/notifications/push-config", authenticate, requireModuleAccess("Notifications"), getPushConfig);

router.post(
  "/notifications/push-subscriptions",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Notifications"),
  validate(createPushSubscriptionSchema),
  createPushSubscription
);
router.delete(
  "/notifications/push-subscriptions/:id",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Notifications"),
  deletePushSubscription
);

router.get("/notifications", authenticate, requireModuleAccess("Notifications"), getNotifications);
router.get("/notifications/unread-count", authenticate, requireModuleAccess("Notifications"), getUnreadCount);

router.patch(
  "/notifications/:id/read",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Notifications"),
  markNotificationRead
);
router.post(
  "/notifications/read-all",
  authenticate,
  denyReadOnlyWrites,
  requireModuleAccess("Notifications"),
  markAllNotificationsRead
);

export default router;
