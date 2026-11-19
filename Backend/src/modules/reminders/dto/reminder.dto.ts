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
  /**
   * The country of the reminder's project: its stored Region (never inferred from a PR number, creator or client). Present on the list responses
   * (GET /reminders, GET /projects/:projectId/reminders); null for a project with no country. Lets the PMO Assistant show each country's reminders in its own section.
   */
  regionId?: string | null;
  country?: string | null;
  /**
   * Project-country time zones: reminderDate + reminderTime are the project's local wall-clock time; dueAt is that moment in UTC and timeZone the project country's IANA
   * zone used for it. Both null on a reminder saved before this change (it keeps its previous behaviour; nothing was converted).
   */
  dueAt: Date | null;
  timeZone: string | null;
}

/** GET /projects/:projectId/reminders and GET /reminders responses — every reminder belonging to that project, or every reminder the caller may see, respectively. */
export interface ReminderListDto {
  items: ReminderDto[];
}

/** GET /projects/:projectId/reminders also says which zone a NEW reminder for this project uses (null when the project has no country). */
export interface ProjectReminderListDto extends ReminderListDto {
  timeZone: string | null;
  country: string | null;
}
