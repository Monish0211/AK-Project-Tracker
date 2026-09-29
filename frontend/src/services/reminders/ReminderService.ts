import type {
  ProjectReminder,
  ReminderNotifyOffset,
  ReminderPriority,
  ReminderRepeat,
  ReminderStatus,
} from "../../types/ProjectReminder";
import { ClientReminderRepository } from "./ClientReminderRepository";
import { apiClient, ApiError } from "../apiClient";
import { dispatchPmoDataChanged } from "../../utils/pmoDataChanged";

// =============================================================================
// BACKEND-CONNECTED PROJECT REMINDERS
// =============================================================================
// Same shape as paymentMilestoneService.ts's Phase 3.4 wiring: PostgreSQL
// (via Backend/src/modules/reminders) is now authoritative. `repository`
// (ClientReminderRepository, localStorage key "pmo_reminders") stays a
// write-through MIRROR only, so reminderScheduler.ts's synchronous 15s
// polling and every other synchronous reader below (getAllReminders /
// getRemindersByProject / getPendingReminders) keep working completely
// unchanged. Every mutating method now talks to the backend FIRST, then
// writes whatever it returned into the mirror — never the other way
// around — so the mirror can never show a state the backend rejected.
//
// Unlike Payment Milestones, no dedicated Ingest endpoint exists for
// Reminders: a reminder's id is never referenced elsewhere by another
// record (no InvoiceLine-style FK), so a legacy local-only reminder can
// simply be migrated with an ordinary POST — it gets a fresh backend id,
// which is fine since nothing outside this module ever points at a
// reminder's id.
const repository = new ClientReminderRepository();

export type SnoozeOption = "5m" | "10m" | "30m" | "1h" | "tomorrow";

const SNOOZE_MINUTES: Record<Exclude<SnoozeOption, "tomorrow">, number> = {
  "5m": 5,
  "10m": 10,
  "30m": 30,
  "1h": 60,
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

const toDateTimeParts = (d: Date): { date: string; time: string } => ({
  date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
  time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
});

// If an edit touches any of these, the reminder's schedule (when/whether it
// should fire, or how it should read when it does) has materially changed,
// so it must behave exactly like a newly created reminder — never silently
// stay "already fired" forever because of a stale trigger flag from before
// the edit.
const SCHEDULING_FIELDS: (keyof ProjectReminder)[] = [
  "reminderDate",
  "reminderTime",
  "notifyOffset",
  "repeat",
  "reminderType",
  "priority",
];

/** Raw shape one row of GET/POST/PATCH /reminders, /projects/:projectId/reminders, /reminders/:id returns — see Backend's ReminderDto. */
interface BackendReminderDto {
  id: string;
  projectId: string;
  projectCode: string;
  title: string;
  description: string | null;
  reminderType: string;
  priority: string;
  status: string;
  reminderDate: string;
  reminderTime: string;
  notifyOffset: string;
  repeat: string;
  createdBy: string;
  isCompleted: boolean;
  completedDate: string | null;
  notificationGenerated: boolean;
  triggeredAt: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

interface BackendReminderListDto {
  items: BackendReminderDto[];
}

/** What the backend's Create Reminder endpoint accepts. */
interface CreateReminderPayload {
  projectCode: string;
  title: string;
  description?: string | null;
  reminderType: string;
  priority: string;
  status: string;
  reminderDate: string;
  reminderTime: string;
  notifyOffset: string;
  repeat: string;
  metadata?: unknown;
}

/** What the backend's Update Reminder endpoint accepts — only the keys actually being changed are ever included. */
interface UpdateReminderPayload {
  projectCode?: string;
  title?: string;
  description?: string | null;
  reminderType?: string;
  priority?: string;
  status?: string;
  reminderDate?: string;
  reminderTime?: string;
  notifyOffset?: string;
  repeat?: string;
  isCompleted?: boolean;
  completedDate?: string | null;
  notificationGenerated?: boolean;
  triggeredAt?: string | null;
  metadata?: unknown;
}

function toProjectReminder(dto: BackendReminderDto): ProjectReminder {
  return {
    id: dto.id,
    projectId: dto.projectId,
    projectCode: dto.projectCode,
    title: dto.title,
    description: dto.description ?? undefined,
    reminderType: dto.reminderType,
    priority: dto.priority as ReminderPriority,
    status: dto.status as ReminderStatus,
    reminderDate: dto.reminderDate.slice(0, 10),
    reminderTime: dto.reminderTime,
    notifyOffset: dto.notifyOffset as ReminderNotifyOffset,
    repeat: dto.repeat as ReminderRepeat,
    createdBy: dto.createdBy,
    createdDate: dto.createdAt,
    completedDate: dto.completedDate ?? undefined,
    isCompleted: dto.isCompleted,
    notificationGenerated: dto.notificationGenerated,
    triggeredAt: dto.triggeredAt ?? undefined,
    metadata: dto.metadata,
  };
}

function toCreatePayload(item: {
  projectCode: string;
  title: string;
  description?: string;
  reminderType: string;
  priority: string;
  status: string;
  reminderDate: string;
  reminderTime: string;
  notifyOffset: string;
  repeat: string;
  metadata?: unknown;
}): CreateReminderPayload {
  return {
    projectCode: item.projectCode,
    title: item.title,
    description: item.description ?? null,
    reminderType: item.reminderType,
    priority: item.priority,
    status: item.status,
    reminderDate: item.reminderDate,
    reminderTime: item.reminderTime,
    notifyOffset: item.notifyOffset,
    repeat: item.repeat,
    ...(item.metadata !== undefined && { metadata: item.metadata }),
  };
}

/** Builds a PATCH body carrying only the fields `effective` actually set — `"triggeredAt" in effective` (not a !== undefined check) so an explicit reset-to-undefined from updateReminder()'s scheduling-changed branch below is still sent through as a real `null`, clearing it server-side too. */
function toUpdatePayload(effective: Partial<ProjectReminder>): UpdateReminderPayload {
  const payload: UpdateReminderPayload = {};
  if (effective.projectCode !== undefined) payload.projectCode = effective.projectCode;
  if (effective.title !== undefined) payload.title = effective.title;
  if (effective.description !== undefined) payload.description = effective.description ?? null;
  if (effective.reminderType !== undefined) payload.reminderType = effective.reminderType;
  if (effective.priority !== undefined) payload.priority = effective.priority;
  if (effective.status !== undefined) payload.status = effective.status;
  if (effective.reminderDate !== undefined) payload.reminderDate = effective.reminderDate;
  if (effective.reminderTime !== undefined) payload.reminderTime = effective.reminderTime;
  if (effective.notifyOffset !== undefined) payload.notifyOffset = effective.notifyOffset;
  if (effective.repeat !== undefined) payload.repeat = effective.repeat;
  if (effective.isCompleted !== undefined) payload.isCompleted = effective.isCompleted;
  if (effective.completedDate !== undefined) payload.completedDate = effective.completedDate ?? null;
  if (effective.notificationGenerated !== undefined) payload.notificationGenerated = effective.notificationGenerated;
  if ("triggeredAt" in effective) payload.triggeredAt = effective.triggeredAt ?? null;
  if (effective.metadata !== undefined) payload.metadata = effective.metadata;
  return payload;
}

class ReminderServiceFacade {
  // Sept 2026 — duplicate reminder fix. loadRemindersForProject() migrates
  // a still-present legacy local-only reminder by POSTing it to the
  // backend; without this guard, opening the same project's Workspace
  // drawer again (a quick reopen, or a second browser tab on the same
  // project) while an earlier migration's GET+POST round trip was still in
  // flight let both calls independently see "no backend reminder yet" and
  // both create one — reproducing the exact production symptom (the same
  // reminder inserted 2-3 times within a few seconds). Keying by projectId
  // (not a single flag) so loading two DIFFERENT projects concurrently is
  // never blocked by this — only overlapping calls for the SAME project
  // collapse onto one shared in-flight promise. This is a client-side
  // defense-in-depth alongside the authoritative fix: the backend's own
  // createReminderForProject() now also refuses to insert an exact
  // duplicate (see Backend's reminder.service.ts), so even a second browser
  // tab / a separate process racing this same call can no longer create a
  // second row either way.
  private inFlightLoadsByProjectId = new Map<string, Promise<ProjectReminder[]>>();

  getAllReminders(): ProjectReminder[] {
    return repository.getAll();
  }

  getRemindersByProject(projectId: string): ProjectReminder[] {
    return this.getAllReminders().filter((r) => r.projectId === projectId);
  }

  getPendingReminders(): ProjectReminder[] {
    return this.getAllReminders().filter((r) => r.status === "Pending");
  }

  /** Replaces one project's slice of the mirror, leaving every other project's reminders untouched — the mirror is a single flat array, not partitioned per-project like Project.paymentMilestones. */
  private replaceProjectRemindersInMirror(projectId: string, items: ProjectReminder[]): void {
    const others = repository.getAll().filter((r) => r.projectId !== projectId);
    repository.saveAll([...others, ...items]);
  }

  /**
   * Called once when a project's workspace (View/Edit Project drawer) is
   * opened: loads this project's reminders from the backend. If the backend
   * has none yet AND the local mirror already has reminders for this
   * project (created before this module was backend-connected), those
   * legacy rows are migrated via ordinary POST — one at a time, each
   * getting a fresh backend-assigned id (safe: no other record references a
   * reminder's id). A row that fails to migrate is kept in the mirror
   * as-is rather than being silently dropped, so a transient network error
   * never loses data.
   */
  async loadRemindersForProject(projectId: string): Promise<ProjectReminder[]> {
    const inFlight = this.inFlightLoadsByProjectId.get(projectId);
    if (inFlight) return inFlight;

    const promise = this.loadRemindersForProjectUncached(projectId).finally(() => {
      this.inFlightLoadsByProjectId.delete(projectId);
    });
    this.inFlightLoadsByProjectId.set(projectId, promise);
    return promise;
  }

  private async loadRemindersForProjectUncached(projectId: string): Promise<ProjectReminder[]> {
    const legacyLocalItems = this.getRemindersByProject(projectId);

    const result = await apiClient.get<BackendReminderListDto>(`/projects/${projectId}/reminders`);
    const backendItems = result.items.map(toProjectReminder);

    if (backendItems.length > 0) {
      this.replaceProjectRemindersInMirror(projectId, backendItems);
      this.emitChange();
      return backendItems;
    }

    if (legacyLocalItems.length === 0) {
      this.replaceProjectRemindersInMirror(projectId, []);
      this.emitChange();
      return [];
    }

    const migrated: ProjectReminder[] = [];
    for (const item of legacyLocalItems) {
      try {
        const created = await apiClient.post<BackendReminderDto>(
          `/projects/${projectId}/reminders`,
          toCreatePayload(item)
        );
        migrated.push(toProjectReminder(created));
      } catch (e) {
        console.error("Failed to migrate legacy reminder to backend", item.id, e);
        migrated.push(item);
      }
    }

    this.replaceProjectRemindersInMirror(projectId, migrated);
    this.emitChange();
    return migrated;
  }

  /**
   * Called once per session (GlobalReminderProvider, on mount): loads every
   * reminder the caller may see, across every project, via GET /reminders —
   * this is what lets the ReminderScheduler evaluate reminders for a
   * project the user hasn't opened this session, and what makes another
   * account's reminder on a shared project visible after login. Merges
   * rather than overwrites: any reminder still only in the local mirror
   * (not yet migrated — its project hasn't been opened in this browser
   * since the backend migration) is kept, exactly like ProjectWorkspaceDrawer's
   * own Notes merge — never wiped out by this refresh before it gets a
   * chance to migrate.
   */
  async refreshAllReminders(): Promise<ProjectReminder[]> {
    const result = await apiClient.get<BackendReminderListDto>("/reminders");
    const backendItems = result.items.map(toProjectReminder);
    const backendIds = new Set(backendItems.map((r) => r.id));
    const legacyOnly = repository.getAll().filter((r) => !backendIds.has(r.id));
    const combined = [...backendItems, ...legacyOnly];
    repository.saveAll(combined);
    this.emitChange();
    return combined;
  }

  async addReminder(
    reminder: Omit<ProjectReminder, "id" | "createdDate" | "isCompleted">
  ): Promise<ProjectReminder> {
    const created = await apiClient.post<BackendReminderDto>(
      `/projects/${reminder.projectId}/reminders`,
      toCreatePayload(reminder)
    );
    const newReminder = toProjectReminder(created);
    repository.saveAll([...repository.getAll(), newReminder]);
    this.emitChange();
    return newReminder;
  }

  async updateReminder(id: string, updates: Partial<ProjectReminder>): Promise<ProjectReminder | null> {
    const all = repository.getAll();
    const current = all.find((r) => r.id === id);
    if (!current) return null;

    const effective: Partial<ProjectReminder> = { ...updates };
    if (effective.status === "Completed" && current.status !== "Completed") {
      effective.isCompleted = true;
      effective.completedDate = new Date().toISOString();
    } else if (effective.status !== undefined && effective.status !== "Completed") {
      effective.isCompleted = false;
    }

    // Editing must never require deleting and recreating the reminder: if
    // any scheduling-relevant field actually changed, clear the trigger
    // state so the Scheduler recalculates and fires again at the new time,
    // instead of the reminder being permanently skipped as "already fired".
    const schedulingChanged = SCHEDULING_FIELDS.some(
      (field) => field in updates && updates[field] !== current[field]
    );
    if (schedulingChanged) {
      effective.notificationGenerated = false;
      effective.triggeredAt = undefined;
    }

    let dto: BackendReminderDto;
    try {
      dto = await apiClient.patch<BackendReminderDto>(`/reminders/${id}`, toUpdatePayload(effective));
    } catch (error) {
      // 404 specifically means the backend has confirmed this reminder no
      // longer exists (e.g. its project was deleted — ProjectReminder is
      // onDelete: Cascade — or it was removed from another account/device).
      // Without this, the local mirror's notificationGenerated flag never
      // gets set (repository.saveAll() below is never reached once this
      // throws), so reminderScheduler.tick() keeps finding the same ghost
      // reminder "still due, never notified" on every 15s poll forever —
      // repeatedly firing a toast/bell entry and repeating this same
      // doomed PATCH. Pruning it here, on the very first failed attempt,
      // stops that loop at its source. Never triggered by a network error
      // or any other status — only a confirmed-gone 404 — so a transient
      // failure can never cause data loss. Same idiom already used
      // elsewhere in this codebase (projectService.ts, Manpower.tsx,
      // ArchivedProjects.tsx, Projects.tsx: `err instanceof ApiError &&
      // err.status === 404`).
      if (error instanceof ApiError && error.status === 404) {
        repository.saveAll(all.filter((r) => r.id !== id));
        this.emitChange();
        return null;
      }
      throw error;
    }
    const updated = toProjectReminder(dto);
    repository.saveAll(all.map((r) => (r.id === id ? updated : r)));
    this.emitChange();
    return updated;
  }

  async deleteReminder(id: string): Promise<void> {
    await apiClient.delete(`/reminders/${id}`);
    repository.saveAll(repository.getAll().filter((r) => r.id !== id));
    this.emitChange();
  }

  /**
   * Creates the next occurrence of a reminder at now + the snooze duration
   * (or, for "tomorrow", at the same time of day one day out). The original
   * reminder is left completely untouched — it already carries
   * notificationGenerated: true from having just fired, so it simply stays
   * as history and won't fire again. The new occurrence always uses "At Due
   * Time" so it fires exactly when the snooze period elapses.
   */
  async snoozeReminder(reminder: ProjectReminder, option: SnoozeOption): Promise<ProjectReminder> {
    const now = new Date();
    let target: Date;

    if (option === "tomorrow") {
      const [h, m] = reminder.reminderTime.split(":").map(Number);
      target = new Date(now);
      target.setDate(target.getDate() + 1);
      target.setHours(h || 0, m || 0, 0, 0);
    } else {
      target = new Date(now.getTime() + SNOOZE_MINUTES[option] * 60_000);
    }

    const { date, time } = toDateTimeParts(target);

    return this.addReminder({
      projectId: reminder.projectId,
      projectCode: reminder.projectCode,
      title: reminder.title,
      description: reminder.description,
      reminderType: reminder.reminderType,
      priority: reminder.priority,
      status: "Pending",
      reminderDate: date,
      reminderTime: time,
      notifyOffset: "At Due Time",
      repeat: "None",
      createdBy: reminder.createdBy,
    });
  }

  private emitChange() {
    // Notify the application that data changed (this triggers the Notification Engine)
    dispatchPmoDataChanged({ entity: "reminder" });
    window.dispatchEvent(new Event("pmo:reminders-changed")); // specific event if UI needs to refresh just reminders
  }
}

export const reminderService = new ReminderServiceFacade();
