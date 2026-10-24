import type { ProjectReminder } from "../types/ProjectReminder";

/**
 * Persistent "this reminder occurrence has already been fired" ledger (Oct 2026).
 *
 * WHY THIS EXISTS. The Reminder Scheduler used to remember what it had fired only in memory, and relied on the BACKEND's
 * `notificationGenerated` flag to survive a page refresh. That flag is written with a PATCH that the server refuses for
 * anyone without write access to the project (Read Only users, and any account that can see a shared project's reminders
 * but not edit them), and it is also lost whenever the PATCH simply fails. For those users the reminder still looked
 * "never notified" after every refresh, so the same old reminder fired again — toast, Bell entry, robot alert and chime —
 * on every page load. This ledger is the per-browser, per-user record that makes a fire idempotent whether or not the
 * server write succeeded.
 *
 * KEY. `id | reminderDate T reminderTime | notifyOffset` — an occurrence, not just an id: a reminder that is genuinely
 * rescheduled (new date/time/offset, same id) is a NEW occurrence and may fire again, while a repeat of the SAME
 * occurrence never does. Entries are kept 90 days (long past anything that could still be "due") and capped, so the
 * stored list cannot grow without bound. Nothing is ever deleted from the reminders themselves.
 */

const STORAGE_PREFIX = "pmo_reminder_fired_v1";
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 2000;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const reminderOccurrenceKey = (
  reminder: Pick<ProjectReminder, "id" | "reminderDate" | "reminderTime" | "notifyOffset">
): string => `${reminder.id}|${reminder.reminderDate}T${reminder.reminderTime}|${reminder.notifyOffset}`;

export class ReminderLedger {
  private scope = "anonymous";
  private entries = new Map<string, number>();
  private loadedScope: string | null = null;
  private readonly storage: () => StorageLike | null;
  private readonly clock: () => number;

  constructor(storage: () => StorageLike | null = defaultStorage, clock: () => number = Date.now) {
    this.storage = storage;
    this.clock = clock;
  }

  /** Which account's ledger is active. Switching accounts in the same browser never lets one user's history suppress another's reminders. */
  setScope(userId: string | null | undefined): void {
    const next = userId && userId.trim() ? userId.trim() : "anonymous";
    if (next === this.scope && this.loadedScope === next) return;
    this.scope = next;
    this.loadedScope = null;
    this.entries = new Map();
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}:${this.scope}`;
  }

  private ensureLoaded(): void {
    if (this.loadedScope === this.scope) return;
    this.loadedScope = this.scope;
    this.entries = new Map();
    try {
      const raw = this.storage()?.getItem(this.storageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        for (const [key, at] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof at === "number" && Number.isFinite(at)) this.entries.set(key, at);
        }
      }
    } catch {
      // Unreadable storage: start empty. The in-memory map still prevents repeats within this page's life.
    }
  }

  has(key: string): boolean {
    this.ensureLoaded();
    return this.entries.has(key);
  }

  /** Records the fire synchronously (before any network call starts) and persists it. */
  mark(key: string): void {
    this.ensureLoaded();
    this.entries.set(key, this.clock());
    this.prune();
    this.persist();
  }

  size(): number {
    this.ensureLoaded();
    return this.entries.size;
  }

  private prune(): void {
    const cutoff = this.clock() - MAX_AGE_MS;
    for (const [key, at] of this.entries) if (at < cutoff) this.entries.delete(key);
    if (this.entries.size > MAX_ENTRIES) {
      const oldestFirst = [...this.entries.entries()].sort((a, b) => a[1] - b[1]);
      for (const [key] of oldestFirst.slice(0, this.entries.size - MAX_ENTRIES)) this.entries.delete(key);
    }
  }

  private persist(): void {
    try {
      this.storage()?.setItem(this.storageKey(), JSON.stringify(Object.fromEntries(this.entries)));
    } catch {
      // Quota/private-mode failure: the in-memory entry still holds for this page's life.
    }
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The one ledger the running app uses. */
export const reminderLedger = new ReminderLedger();
