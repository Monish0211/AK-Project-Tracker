import type { PMONotification } from "./notificationTypes";
import type { NotificationRepository } from "./notificationRepository";

export class NotificationStore {
  private notifications: PMONotification[] = [];
  private repo: NotificationRepository;

  constructor(repo: NotificationRepository) {
    this.repo = repo;
    this.notifications = this.repo.getAll();
  }

  getAll(): PMONotification[] {
    return [...this.notifications];
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.isRead && !n.isArchived).length;
  }

  /** Sync active notifications from engine evaluation with existing state */
  syncRuleNotifications(activeRuleNotifications: PMONotification[]) {
    // 1. Separate persistent events from auto-resolving rules
    const eventNotifications = this.notifications.filter((n) => n.persistent);
    
    // 2. We keep existing rule notifications if they are still active, 
    // to preserve their 'isRead' or 'isArchived' state.
    // We remove rule notifications that are no longer active (auto-resolved).
    const activeMap = new Map<string, PMONotification>();
    activeRuleNotifications.forEach(n => activeMap.set(n.id, n));

    const updatedRuleNotifications: PMONotification[] = [];

    // Map through currently active rules
    for (const [id, activeNotice] of activeMap.entries()) {
      const existing = this.notifications.find((n) => n.id === id);
      if (existing) {
        // Keep existing state, but update message/timestamp if needed
        updatedRuleNotifications.push({ ...existing, ...activeNotice, isRead: existing.isRead, isArchived: existing.isArchived });
      } else {
        // It's a new rule violation
        updatedRuleNotifications.push(activeNotice);
      }
    }

    this.notifications = [...eventNotifications, ...updatedRuleNotifications];
    this.persist();
    this.emitChange();
  }

  addEventNotification(notification: PMONotification) {
    // Check if it already exists (events are usually unique by random UUID, but just in case)
    if (!this.notifications.some(n => n.id === notification.id)) {
      this.notifications.unshift(notification); // Add to top
      this.persist();
      this.emitChange();
    }
  }

  markAsRead(id: string) {
    this.notifications = this.notifications.map((n) =>
      n.id === id ? { ...n, isRead: true } : n
    );
    this.persist();
    this.emitChange();
  }

  markAllAsRead() {
    this.notifications = this.notifications.map((n) => ({ ...n, isRead: true }));
    this.persist();
    this.emitChange();
  }

  archive(id: string) {
    this.notifications = this.notifications.map((n) =>
      n.id === id ? { ...n, isArchived: true } : n
    );
    this.persist();
    this.emitChange();
  }

  clearRead() {
    this.notifications = this.notifications.map((n) =>
      n.isRead ? { ...n, isArchived: true } : n
    );
    this.persist();
    this.emitChange();
  }

  private persist() {
    this.repo.saveAll(this.notifications);
  }

  private emitChange() {
    window.dispatchEvent(new Event("pmo:notifications-changed"));
  }
}
