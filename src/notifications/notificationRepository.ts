import type { PMONotification } from "./notificationTypes";

export interface NotificationRepository {
  getAll(): PMONotification[];
  saveAll(notifications: PMONotification[]): void;
}

const STORAGE_KEY = "pmo_notifications";

/**
 * Client-side implementation using localStorage.
 * In the future, a RestNotificationRepository will implement NotificationRepository
 * to talk to the SQL Database without changing the engine.
 */
export class ClientNotificationRepository implements NotificationRepository {
  getAll(): PMONotification[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data) as PMONotification[];
    } catch (e) {
      console.error("Failed to load notifications from local repository", e);
      return [];
    }
  }

  saveAll(notifications: PMONotification[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch (e) {
      console.error("Failed to save notifications to local repository", e);
    }
  }
}
