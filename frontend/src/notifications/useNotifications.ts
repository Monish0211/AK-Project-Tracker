import { useState, useEffect, useCallback } from "react";
import { notificationService } from "./notificationService";
import type { PMONotification } from "./notificationTypes";

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<PMONotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const sync = useCallback(() => {
    setNotifications(notificationService.getAll());
    setUnreadCount(notificationService.getUnreadCount());
  }, []);

  useEffect(() => {
    sync(); // Initial load
    window.addEventListener("pmo:notifications-changed", sync);
    return () => {
      window.removeEventListener("pmo:notifications-changed", sync);
    };
  }, [sync]);

  return { notifications, unreadCount };
};
