import { RestNotificationRepository } from "./restNotificationRepository";
import { notificationService } from "./notificationService";

/**
 * Priority #6 Phase 3B — bridges backend (database-persisted, push-delivered)
 * Notification rows into the existing local rule-engine's notification
 * store, WITHOUT modifying notificationStore.ts, ClientNotificationRepository,
 * or the rule engine (notificationEngine.ts/notificationRules.ts) at all.
 *
 * RestNotificationRepository is deliberately NOT swapped in as the live
 * NotificationStore repository — see that file's own header comment on why
 * a literal live-repository swap isn't safe (its getAll() is a synchronous
 * read of an async-populated cache, while NotificationStore's constructor
 * expects a synchronous getAll() up front). Instead, this module calls its
 * already-existing, already-tested refresh() (which already maps backend
 * DTOs into full PMONotification objects — see that file) and feeds each
 * one through notificationService.dispatchEvent() — the SAME existing entry
 * point the local rule engine's own one-shot event notifications (Project
 * Created, reminders, ...) already use — so NotificationStore's own
 * id-based dedup (addEventNotification()) is reused unmodified rather than
 * reinvented here. Existing local notifications, reminders, and the audit/
 * activity log are never read or touched by this file.
 *
 * Known limitation: once a backend notification has been synced into the
 * local store, addEventNotification()'s id-based dedup means a later sync
 * will never overwrite it — so marking it read locally (via the existing
 * Drawer UI) does not currently round-trip back to the backend's own
 * isRead flag via REST, and a backend-side read-state change after the
 * first sync won't retroactively update the local copy either. Read-state
 * is effectively local-first once synced. Full bidirectional sync was not
 * requested for this phase and is not implemented.
 */

const restRepo = new RestNotificationRepository();

let inFlightSync: Promise<void> | null = null;
let lastSyncCompletedAt = 0;
// A cool-down, NOT a polling interval — nothing here is ever scheduled on a
// timer. This only ever runs in response to an actual caller (the
// Notification Bell mounting, or the drawer being opened), and exists
// solely to collapse back-to-back callers (e.g. the Bell remounting on a
// route change) into one request instead of one each. Real-time delivery
// is already handled by Web Push + the Service Worker — this sync's job is
// only to populate/catch up the in-drawer history, never to be the
// real-time channel itself (per the approved "avoid aggressive polling"
// instruction).
const SYNC_COOLDOWN_MS = 15000;

/** Fetches the caller's own recent backend notifications and feeds any new ones into the local store. Never throws — a failed fetch is logged and left for the next call to retry, matching timesheetService.ts's ensureTimesheetImportsFresh() precedent for the same class of problem. */
export function syncBackendNotifications(): Promise<void> {
  if (inFlightSync) return inFlightSync;
  if (Date.now() - lastSyncCompletedAt < SYNC_COOLDOWN_MS) return Promise.resolve();

  inFlightSync = restRepo
    .refresh(50)
    .then((backendNotifications) => {
      // Oldest first, so unshift-based insertion in addEventNotification()
      // ends up with the newest backend notification on top — matching the
      // Drawer's own newest-first sort, and matching how a fresh push
      // notification would have landed if synced one at a time.
      for (let i = backendNotifications.length - 1; i >= 0; i--) {
        const n = backendNotifications[i]!;
        notificationService.dispatchEvent({
          id: n.id,
          isRead: n.isRead,
          ruleId: n.ruleId,
          version: n.version,
          title: n.title,
          message: n.message,
          category: n.category,
          severity: n.severity,
          source: n.source,
          targetAudience: n.targetAudience,
          deliveryChannels: n.deliveryChannels,
          projectId: n.projectId,
          timestamp: n.timestamp,
          actionRoute: n.actionRoute,
        });
      }
      lastSyncCompletedAt = Date.now();
    })
    .catch((err) => {
      console.warn("Could not sync backend notifications — showing last known local data.", err);
    })
    .finally(() => {
      inFlightSync = null;
    });

  return inFlightSync;
}
