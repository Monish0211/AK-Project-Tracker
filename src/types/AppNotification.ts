export interface AppNotification {
  id: string;
  type: "project" | "invoice" | "expense" | "payment" | "team" | "system";
  title: string;
  description: string;
  time: string; // e.g. "5 min ago", "25 min ago", "Yesterday"
  isRead: boolean;
  createdAt: string; // ISO datetime string
}
