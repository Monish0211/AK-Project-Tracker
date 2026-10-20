import { z, type ZodType } from "zod";
import { AppError } from "../../../shared/utils/AppError.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../weeklyPaging.js";

/** Shape check only — address validation and duplicate rejection happen in the service (validateRecipients). */
export const updateMissingExpenseRecipientsSchema = z.object({
  toEmail: z.string().trim().min(1, "The To address is required.").max(320),
  cc: z
    .array(
      z.object({
        email: z.string().trim().max(320).optional(),
        portalUserId: z.string().uuid().nullable().optional(),
      })
    )
    .max(50, "At most 50 CC recipients."),
});

export type UpdateMissingExpenseRecipientsBody = z.infer<typeof updateMissingExpenseRecipientsSchema>;

/** "manual" = an extra run now (own period key); "retry-weekly" = (re)run this week's scheduled run, respecting "already sent". */
export const runMissingExpenseJobSchema = z.object({
  mode: z.enum(["manual", "retry-weekly"]).default("manual"),
});

// ── Paged preview / run history (query strings) ─────────────────────────────

const pageParams = {
  page: z.coerce.number().int("page must be a whole number.").min(1, "page must be 1 or more.").max(1_000_000).default(1),
  pageSize: z.coerce
    .number()
    .int("pageSize must be a whole number.")
    .min(1, "pageSize must be 1 or more.")
    .max(MAX_PAGE_SIZE, `pageSize must be at most ${MAX_PAGE_SIZE}.`)
    .default(DEFAULT_PAGE_SIZE),
};

/** Sorting is fixed server-side (stable across pages), so no sort parameter is accepted — unknown keys are rejected. */
export const previewPageQuerySchema = z.object(pageParams).strict();

/** Statuses as shown to users (INTERRUPTED / DELIVERY_UNKNOWN include stale RUNNING / SENDING rows). */
export const RUN_DISPLAY_STATUSES = ["RUNNING", "SENDING", "SENT", "FAILED", "NO_MISSING", "DISABLED", "DELIVERY_UNKNOWN", "INTERRUPTED"] as const;
export type RunDisplayStatus = (typeof RUN_DISPLAY_STATUSES)[number];

export const runHistoryQuerySchema = z
  .object({
    ...pageParams,
    status: z.enum(RUN_DISPLAY_STATUSES).optional(),
    trigger: z.enum(["scheduled", "manual"]).optional(),
  })
  .strict();

export type PreviewPageQuery = z.infer<typeof previewPageQuerySchema>;
export type RunHistoryQuery = z.infer<typeof runHistoryQuerySchema>;

/** Parses a query string with one of the schemas above; 400 with the first issue otherwise (same message style as validate()). */
export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(issue ? `${issue.path.join(".") || "query"}: ${issue.message}` : "Invalid query.", 400);
  }
  return result.data;
}
