/**
 * Request/response shapes for the Reminders module — same split as
 * milestone.dto.ts: response DTOs describe what the API returns;
 * Create/Update DTOs describe what a request body carries. Each
 * ProjectReminder belongs to exactly one Project.
 */
export interface CreateReminderDto {
  projectCode: string;
  title: string;
  description?: string | null;
  reminderType: string;
  priority: string;
  status: string;
  reminderDate: Date;
  reminderTime: string;
  notifyOffset: string;
  repeat: string;
  metadata?: unknown;
}

/** Same fields as CreateReminderDto (plus the completion/notification bookkeeping fields), all optional — a PATCH only carries what changed. */
export interface UpdateReminderDto {
  projectCode?: string;
  title?: string;
  description?: string | null;
  reminderType?: string;
  priority?: string;
  status?: string;
  reminderDate?: Date;
  reminderTime?: string;
  notifyOffset?: string;
  repeat?: string;
  isCompleted?: boolean;
  completedDate?: Date | null;
  notificationGenerated?: boolean;
  triggeredAt?: Date | null;
  metadata?: unknown;
}

export interface ReminderDto {
  id: string;
  projectId: string;
  projectCode: string;
  title: string;
  description: string | null;
  reminderType: string;
  priority: string;
  status: string;
  reminderDate: Date;
  reminderTime: string;
  notifyOffset: string;
  repeat: string;
  createdBy: string;
  isCompleted: boolean;
  completedDate: Date | null;
  notificationGenerated: boolean;
  triggeredAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/** GET /projects/:projectId/reminders and GET /reminders responses — every reminder belonging to that project, or every reminder the caller may see, respectively. */
export interface ReminderListDto {
  items: ReminderDto[];
}
