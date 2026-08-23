import { apiClient } from "../services/apiClient";
import type { NotificationRepository } from "./notificationRepository";
import type { PMONotification } from "./notificationTypes";

/**
 * Priority #6, Phase 2 — a REST-backed implementation of the SAME
 * NotificationRepository interface ClientNotificationRepository already
 * implements, exactly matching that file's own forward-looking comment
 * ("In the future, a RestNotificationRepository will implement
 * NotificationRepository to talk to the SQL Database without changing the
 * engine"). Built and tested this phase; deliberately NOT wired into the
 * live notificationStore/notificationEngine singleton yet — see this
 * module's own README-style note below for why.
 *
 * WHY NOT WIRED IN YET: NotificationRepository's getAll()/saveAll() are
 * synchronous, matching localStorage's synchronous API — a REST call is
 * inherently asynchronous, so a literal live swap isn't possible without
 * either (a) changing the interface to be async (which would ripple into
 * notificationStore.ts/notificationEngine.ts, explicitly off-limits this
 * phase) or (b) this in-memory-cache-plus-background-refresh() pattern
 * below, which satisfies the interface's synchronous shape but means
 * getAll() can return stale data between refresh() calls. That tradeoff is
 * a real product decision (how should backend-originated notifications
 * visually merge with the existing rule-engine notifications in one bell/
 * drawer?) that belongs to a deliberate Phase 3 design conversation, not
 * something to decide unilaterally while building infrastructure.
 *
 * saveAll() is intentionally a documented no-op here: the backend's REST
 * surface exposes purpose-built endpoints for the one real write this app
 * needs (mark one/all read — see notification.controller.ts), which is a
 * much narrower and safer operation than "persist this entire array back to
 * the server." Callers that need to mark a backend notification read should
 * call the dedicated API directly (a future addition alongside wiring this
 * repository into the live store), not go through saveAll().
 */
export class RestNotificationRepository implements NotificationRepository {
  private cache: PMONotification[] = [];

  getAll(): PMONotification[] {
    return this.cache;
  }

  saveAll(_notifications: PMONotification[]): void {
    console.warn(
      "RestNotificationRepository.saveAll() is a no-op by design — use the dedicated mark-read/mark-all-read REST calls instead of a bulk save."
    );
  }

  /** Fetches the caller's own backend notifications and maps them into the existing PMONotification shape, filling the rule-engine-specific fields with reasonable, honestly-generic defaults since a backend event has no rule/version/deliveryChannels concept of its own. */
  async refresh(pageSize = 50): Promise<PMONotification[]> {
    const result = await apiClient.get<{
      items: {
        id: string;
        title: string;
        message: string;
        type: string;
        severity: string;
        entityType: string | null;
        entityId: string | null;
        actionUrl: string | null;
        isRead: boolean;
        createdAt: string;
        readAt: string | null;
      }[];
    }>(`/notifications?page=1&pageSize=${pageSize}`);

    this.cache = result.items.map((dto) => ({
      id: dto.id,
      ruleId: dto.type,
      version: 1,
      title: dto.title,
      message: dto.message,
      category: dto.severity === "Critical" ? "Critical" : dto.severity === "High" ? "Warning" : "Information",
      severity: (["Critical", "High", "Medium", "Low", "Info"].includes(dto.severity) ? dto.severity : "Info") as PMONotification["severity"],
      source: "System",
      targetAudience: "Everyone",
      deliveryChannels: ["InApp", "Push"],
      projectId: dto.entityType === "Project" ? (dto.entityId ?? undefined) : undefined,
      timestamp: dto.createdAt,
      isRead: dto.isRead,
      isArchived: false,
      persistent: true,
      autoResolve: false,
      actionRoute: dto.actionUrl ?? undefined,
    }));

    return this.cache;
  }
}
