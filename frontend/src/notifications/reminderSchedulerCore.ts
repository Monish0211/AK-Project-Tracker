import type { ProjectReminder } from "../types/ProjectReminder";
import { getNotifyOffsetMinutes } from "../types/ProjectReminder";
import { reminderOccurrenceKey, type ReminderLedger } from "./reminderLedger";
import { isRecurring, nextOccurrence } from "./reminderRecurrence";

/**
 * The Reminder Scheduler's logic, free of any app wiring so it can be tested with fake timers and fake collaborators
 * (see reminderScheduler.ts for the singleton that connects it to the real services).
 *
 * It is the sole authority for turning a pending reminder into a notification (Bell entry + toast + chime + robot alert) once
 * its notify time arrives, and it guarantees that happens ONCE per reminder occurrence:
 *
 *  1. A persistent ledger (reminderLedger.ts) is checked and written synchronously before anything else — so the same
 *     occurrence cannot fire again on the next poll, on a second running scheduler, after a refresh, or after the server
 *     refused/failed to record `notificationGenerated` (the cause of "old reminders keep coming back" for Read Only users).
 *  2. The reminder's own `notificationGenerated` flag still excludes it once the server has recorded it (shared across
 *     devices/accounts, as before).
 *  3. The Bell entry has a deterministic id, and the Bell store ignores a duplicate id — a last line of defence.
 *
 * Recurring reminders: when an occurrence fires, the next occurrence is created (never edited in place), so the one that
 * fired stays as history. See reminderRecurrence.ts.
 */

export interface FiredReminderDetail {
  /** Occurrence key (reminderLedger.reminderOccurrenceKey) — unique per reminder occurrence. */
  key: string;
  reminderId: string;
  projectId: string;
  projectCode: string;
  title: string;
  isDueNow: boolean;
  firedAt: string;
}

export interface SchedulerDeps {
  getPendingReminders(): ProjectReminder[];
  updateReminder(id: string, updates: Partial<ProjectReminder>): Promise<unknown>;
  addReminder(reminder: Omit<ProjectReminder, "id" | "createdDate" | "isCompleted">): Promise<unknown>;
  /** Permanent Bell entry; `id` is deterministic so a duplicate is ignored by the store. */
  notifyBell(args: { id: string; reminder: ProjectReminder; isDueNow: boolean; now: Date }): void;
  pushToast(args: { id: string; reminder: ProjectReminder; dueAt: string; createdAt: string }): void;
  /** Called once per tick with every occurrence key that fired in it (never with an empty list). */
  playSound(keys: string[]): void;
  /** Broadcast so the robot (and anything else) can react to what actually fired — once per fired batch. */
  emitFired(batch: FiredReminderDetail[]): void;
  ledger: ReminderLedger;
  now(): Date;
  eventTarget: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(handler: () => void, ms: number): unknown;
  log: { warn(...a: unknown[]): void; error(...a: unknown[]): void };
}

// Poll every 15s: frequent enough that a 1-minute notify offset never slips noticeably late, cheap enough (one array filter over
// pending reminders only) to run indefinitely.
export const POLL_INTERVAL_MS = 15_000;
const RECENT_FIRE_WINDOW_MS = 120_000;

export const parseDueDateTime = (reminder: Pick<ProjectReminder, "reminderDate" | "reminderTime">): Date =>
  new Date(`${reminder.reminderDate}T${reminder.reminderTime || "00:00"}:00`);

export const computeTriggerTime = (reminder: Pick<ProjectReminder, "reminderDate" | "reminderTime" | "notifyOffset">): Date => {
  const due = parseDueDateTime(reminder);
  return new Date(due.getTime() - getNotifyOffsetMinutes(reminder.notifyOffset) * 60_000);
};

export class ReminderSchedulerCore {
  private timerId: unknown = null;
  private started = false;
  private spawnedRecurrenceKeys = new Set<string>();
  /** Recurring fires whose "create the next occurrence" call failed for a transient reason (offline, 5xx) and is retried on later ticks. */
  private spawnRetries = new Map<string, { reminder: ProjectReminder; attempts: number }>();
  private recentFires: { at: number; detail: FiredReminderDetail }[] = [];

  private readonly deps: SchedulerDeps;

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  private onDataChanged = (): void => {
    // Deferred: this listener also fires as a side effect of this scheduler's own updateReminder(), so running inline would
    // re-enter tick() from inside its own loop.
    this.deps.setTimeout(() => this.tick(), 0);
  };

  /** Binds the ledger to the signed-in account and starts polling. Safe to call repeatedly. */
  start(userId?: string | null): void {
    this.deps.ledger.setScope(userId);
    if (this.started) return;
    this.started = true;
    this.tick(); // catch up immediately (covers reminders that became due while the app was closed)
    this.timerId = this.deps.setInterval(() => this.tick(), POLL_INTERVAL_MS);
    this.deps.eventTarget.addEventListener("pmo:reminders-changed", this.onDataChanged);
  }

  stop(): void {
    if (this.timerId !== null) this.deps.clearInterval(this.timerId);
    this.timerId = null;
    this.started = false;
    this.deps.eventTarget.removeEventListener("pmo:reminders-changed", this.onDataChanged);
  }

  /** What fired in the last couple of minutes — lets a component that mounts a moment late (the lazy robot chunk) still show it once. */
  getRecentFires(windowMs: number = RECENT_FIRE_WINDOW_MS): FiredReminderDetail[] {
    const cutoff = this.deps.now().getTime() - windowMs;
    this.recentFires = this.recentFires.filter((f) => f.at >= cutoff);
    return this.recentFires.map((f) => f.detail);
  }

  tick(): FiredReminderDetail[] {
    const now = this.deps.now();
    const fired: FiredReminderDetail[] = [];

    for (const [key, entry] of this.spawnRetries) {
      this.spawnRetries.delete(key);
      this.spawnedRecurrenceKeys.delete(key);
      void this.spawnNextOccurrence(entry.reminder, key, now, entry.attempts);
    }

    const candidates = this.deps
      .getPendingReminders()
      .filter((r) => !r.notificationGenerated && !this.deps.ledger.has(reminderOccurrenceKey(r)));

    for (const reminder of candidates) {
      if (now.getTime() < computeTriggerTime(reminder).getTime()) continue; // not yet — never early
      const key = reminderOccurrenceKey(reminder);
      if (this.deps.ledger.has(key)) continue; // re-check: an earlier iteration/instance may have just fired it
      fired.push(this.fire(reminder, key, now));
    }

    if (fired.length > 0) {
      this.recentFires.push(...fired.map((detail) => ({ at: now.getTime(), detail })));
      this.deps.emitFired(fired);
      this.deps.playSound(fired.map((f) => f.key));
    }
    return fired;
  }

  private fire(reminder: ProjectReminder, key: string, now: Date): FiredReminderDetail {
    // Recorded and persisted synchronously, before anything async starts.
    this.deps.ledger.mark(key);

    const dueAt = parseDueDateTime(reminder);
    const isDueNow = now.getTime() >= dueAt.getTime();

    this.deps.notifyBell({ id: `reminder-trigger:${key}`, reminder, isDueNow, now });
    this.deps.pushToast({ id: `toast-${key}`, reminder, dueAt: dueAt.toISOString(), createdAt: now.toISOString() });

    // Recurring: create the next occurrence (idempotently) before recording the flag, so a recurring reminder that fired is
    // never left without a successor if the flag write fails. Failures are reported, never thrown into the poll loop.
    if (isRecurring(reminder.repeat)) void this.spawnNextOccurrence(reminder, key, now);

    this.deps
      .updateReminder(reminder.id, { notificationGenerated: true, triggeredAt: now.toISOString() })
      .catch((error) => {
        // Expected for a Read Only user or anyone without write access to the project (the server refuses the PATCH). The
        // ledger already guarantees this occurrence is not fired again in this browser.
        this.deps.log.warn("Reminder fired; the server did not record it (it will not fire again in this browser):", error);
      });

    return {
      key,
      reminderId: reminder.id,
      projectId: reminder.projectId,
      projectCode: reminder.projectCode,
      title: reminder.title,
      isDueNow,
      firedAt: now.toISOString(),
    };
  }

  private async spawnNextOccurrence(reminder: ProjectReminder, key: string, now: Date, attempts = 0): Promise<void> {
    if (this.spawnedRecurrenceKeys.has(key)) return;
    this.spawnedRecurrenceKeys.add(key);
    const next = nextOccurrence(reminder, now);
    if (!next) return;
    const priorMeta = reminder.metadata && typeof reminder.metadata === "object" ? (reminder.metadata as Record<string, unknown>) : {};
    try {
      await this.deps.addReminder({
        projectId: reminder.projectId,
        projectCode: reminder.projectCode,
        title: reminder.title,
        description: reminder.description,
        reminderType: reminder.reminderType,
        priority: reminder.priority,
        status: "Pending",
        reminderDate: next.reminderDate,
        reminderTime: next.reminderTime,
        notifyOffset: reminder.notifyOffset,
        repeat: reminder.repeat,
        createdBy: reminder.createdBy,
        notificationGenerated: false,
        metadata: {
          ...priorMeta,
          recurrenceOf: reminder.id,
          recurrenceAnchorDate: next.recurrenceAnchorDate,
          recurrenceIndex: next.recurrenceIndex,
        },
      });
    } catch (error) {
      // A 4xx (not allowed, not found, invalid) will not get better by retrying — a Read Only user can never create one. Anything
      // else (offline, 5xx) is retried on the next few ticks. The server treats an identical create as the same reminder, so a
      // retry after a lost response can never produce a duplicate.
      const status = (error as { status?: number } | null)?.status;
      const permanent = typeof status === "number" && status >= 400 && status < 500;
      if (!permanent && attempts < 5) this.spawnRetries.set(key, { reminder, attempts: attempts + 1 });
      this.deps.log.warn("Could not create the next occurrence of a recurring reminder:", error);
    }
  }
}
