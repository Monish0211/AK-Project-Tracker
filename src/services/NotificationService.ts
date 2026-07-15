import type { AppNotification } from "../types/AppNotification";

const STORAGE_KEY = "pmo_notifications";

const DEFAULT_NOTIFICATIONS: AppNotification[] = [
  {
    id: "1",
    type: "invoice",
    title: "Invoice Submitted",
    description: "Invoice INV-024 has been submitted.",
    time: "5 min ago",
    isRead: false,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    type: "team",
    title: "Team Updated",
    description: "Rahul Kumar was assigned.",
    time: "25 min ago",
    isRead: false,
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
  },
  {
    id: "3",
    type: "payment",
    title: "Payment Received",
    description: "L&T released ₹2,40,000.",
    time: "Yesterday",
    isRead: true,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const getNotifications = (): AppNotification[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_NOTIFICATIONS));
    return DEFAULT_NOTIFICATIONS;
  }
  try {
    return JSON.parse(data);
  } catch {
    return DEFAULT_NOTIFICATIONS;
  }
};

export const saveNotifications = (notifications: AppNotification[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
};

export const markAllAsRead = (): AppNotification[] => {
  const current = getNotifications();
  const updated = current.map((n) => ({ ...n, isRead: true }));
  saveNotifications(updated);
  return updated;
};

export const markAsRead = (id: string): AppNotification[] => {
  const current = getNotifications();
  const updated = current.map((n) => (n.id === id ? { ...n, isRead: true } : n));
  saveNotifications(updated);
  return updated;
};
export default getNotifications;
