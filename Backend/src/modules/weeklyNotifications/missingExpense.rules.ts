/**
 * Weekly "Projects Missing Other Project Expenses" email (Oct 2026) — pure
 * rules, no I/O. Everything here is unit-tested in missingExpense.rules.test.ts.
 */

export const MISSING_EXPENSE_JOB_NAME = "missing_other_project_expenses";
export const MISSING_EXPENSE_SETTING_KEY = "missing_other_project_expenses";
export const MISSING_EXPENSE_SUBJECT = "Weekly Report — Projects Missing Other Project Expenses";

// ── Project eligibility ─────────────────────────────────────────────────────

/**
 * Status values are free text (manual dropdown + permissive Excel import), so
 * they are compared after normalization: case-insensitive, hyphens/underscores
 * read as spaces, whitespace collapsed. Only an EXACT normalized match is
 * excluded — "KoM Completed" stays eligible even though it contains
 * "Completed". "Canceled" is the US spelling of "Cancelled".
 */
const EXCLUDED_STATUS_KEYS = new Set(["not started", "on hold", "completed", "cancelled", "canceled"]);

export function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function isEligibleStatus(status: string | null | undefined): boolean {
  return !EXCLUDED_STATUS_KEYS.has(normalizeStatus(status));
}

export interface CandidateProject {
  id: string;
  prNo: string;
  client: string;
  projectTitle: string;
  projectManager: string | null;
  projectStatus: string;
  /** Persisted, active Other Project Expenses rows (any amount, including 0). */
  otherExpenseCount: number;
}

export interface MissingExpenseReport {
  eligibleCount: number;
  missing: CandidateProject[];
}

/**
 * Eligible = not Not Started / On Hold / Completed / Cancelled (archived projects are already
 * excluded by the query). Missing = eligible AND zero Other Project Expenses
 * records — the record count, never the amount, decides.
 */
/**
 * PR-number order ("PR-9" before "PR-10"). One shared collator: identical to
 * `a.localeCompare(b, "en", { numeric: true })` (which builds a new collator
 * on every comparison — ~0.5 s for a few thousand projects).
 */
export const prNoCollator = new Intl.Collator("en", { numeric: true });

export function buildMissingExpenseReport(projects: CandidateProject[]): MissingExpenseReport {
  const eligible = projects.filter((p) => isEligibleStatus(p.projectStatus));
  const missing = eligible
    .filter((p) => p.otherExpenseCount === 0)
    .sort((a, b) => prNoCollator.compare(a.prNo, b.prNo));
  return { eligibleCount: eligible.length, missing };
}

// ── Recipients ──────────────────────────────────────────────────────────────

/**
 * Code defaults, used until an administrator first saves the settings.
 * The CC addresses are the real PortalUser emails found for the requested
 * people (Monish → monish.n@ifluids.com; Sivagnayanam → the "Sivagnanam"
 * account, sivagnanam@ifluids.com). "Suresh" had no matching user, so no
 * address is guessed for them — see UNRESOLVED_DEFAULT_CC.
 */
export const DEFAULT_TO_EMAIL = "info@ifluids.com";
export const DEFAULT_CC_EMAILS: readonly string[] = ["sivagnanam@ifluids.com", "monish.n@ifluids.com"];
export const UNRESOLVED_DEFAULT_CC: readonly string[] = ["Suresh"];

// Pragmatic address check (same strictness as zod's email()); the mail server
// remains the final authority.
const EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export interface RecipientInput {
  toEmail: string;
  ccEmails: string[];
}

export type RecipientValidation =
  | { ok: true; toEmail: string; ccEmails: string[] }
  | { ok: false; message: string };

/** Trims, validates and rejects duplicates (within CC, and CC repeating the To address). */
export function validateRecipients(input: RecipientInput): RecipientValidation {
  const toEmail = input.toEmail.trim();
  if (!toEmail) return { ok: false, message: "The To address is required." };
  if (!isValidEmail(toEmail)) return { ok: false, message: `"${toEmail}" is not a valid email address.` };

  const seen = new Set([normalizeEmail(toEmail)]);
  const ccEmails: string[] = [];
  for (const raw of input.ccEmails) {
    const email = raw.trim();
    if (!email) continue;
    if (!isValidEmail(email)) return { ok: false, message: `"${email}" is not a valid email address.` };
    const key = normalizeEmail(email);
    if (seen.has(key)) return { ok: false, message: `"${email}" is listed more than once.` };
    seen.add(key);
    ccEmails.push(email);
  }
  return { ok: true, toEmail, ccEmails };
}

// ── Scheduling ──────────────────────────────────────────────────────────────

/** Calendar date (Y, M, D) of `date` as seen in `timeZone`. */
function zonedYmd(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/**
 * ISO-8601 week key ("2026-W42") of `date` in `timeZone` — the idempotency
 * key of a weekly run, so every tick within the same local week maps to the
 * same key (a Sunday-23:30 IST tick is still that week, not the next).
 */
export function weeklyPeriodKey(date: Date, timeZone: string): string {
  const { y, m, d } = zonedYmd(date, timeZone);
  const day = new Date(Date.UTC(y, m - 1, d));
  const weekday = day.getUTCDay() || 7; // Mon=1 … Sun=7
  day.setUTCDate(day.getUTCDate() + 4 - weekday); // Thursday of this ISO week
  const isoYear = day.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** "17 Oct 2026, 09:00 IST (Asia/Kolkata)" — report generation stamp. */
export function formatReportTimestamp(date: Date, timeZone: string): string {
  const stamp = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(date);
  return `${stamp} (${timeZone})`;
}

/** A RUNNING claim older than this is treated as abandoned (process crashed before sending). */
export const STALE_RUN_MS = 30 * 60 * 1000;

/**
 * Manual runs share one period key per 10-minute window, so the same
 * database lock that guards the weekly run also stops two near-simultaneous
 * "Run now" requests (double click, two tabs, two admins, two servers) from
 * each sending an email. A FAILED manual run can still be retried within the
 * window (FAILED is reclaimable); a SENT one blocks repeats until the window
 * passes.
 */
export const MANUAL_RUN_WINDOW_MS = 10 * 60 * 1000;

export function manualPeriodKey(date: Date): string {
  const bucket = new Date(Math.floor(date.getTime() / MANUAL_RUN_WINDOW_MS) * MANUAL_RUN_WINDOW_MS);
  return `manual:${bucket.toISOString().slice(0, 16)}Z`;
}

/**
 * Status as shown in Settings. A RUNNING/SENDING row whose process died stays
 * in that state in the database until something claims the same period again
 * (the weekly key gets no second scheduler tick), so the view reports it
 * honestly instead of "Running"/"Sending" forever. Read-only — never written.
 */
export function displayRunStatus(status: string, updatedAt: Date, now: Date): string {
  const stale = now.getTime() - updatedAt.getTime() > STALE_RUN_MS;
  if (stale && status === "SENDING") return "DELIVERY_UNKNOWN";
  if (stale && status === "RUNNING") return "INTERRUPTED";
  return status;
}
