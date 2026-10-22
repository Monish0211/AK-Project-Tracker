import { z, type ZodType } from "zod";
import { AppError } from "../../../shared/utils/AppError.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../weeklyNotifications/weeklyPaging.js";
import { ALL_MONTHS, parseMonth } from "../invoiceTracker.rules.js";

/** A real month ("YYYY-MM", the month a workflow record was CREATED in) or "all" for every month. */
const month = z
  .string({ error: "month is required (YYYY-MM, or all)." })
  .refine((m) => m === ALL_MONTHS || parseMonth(m) !== null, 'month must be a real month in the form YYYY-MM, or "all".');

/** Sorting is fixed server-side (PR number, then id), so no sort parameter is accepted — unknown keys are rejected. */
export const trackerListQuerySchema = z
  .object({
    month,
    page: z.coerce.number().int("page must be a whole number.").min(1, "page must be 1 or more.").max(1_000_000).default(1),
    pageSize: z.coerce
      .number()
      .int("pageSize must be a whole number.")
      .min(1, "pageSize must be 1 or more.")
      .max(MAX_PAGE_SIZE, `pageSize must be at most ${MAX_PAGE_SIZE}.`)
      .default(DEFAULT_PAGE_SIZE),
    search: z.string().trim().max(100).optional(),
    projectStatus: z.string().trim().min(1).max(60).optional(),
    filter: z.enum(["all", "raised", "notRaised", "requestPending"]).default("all"),
  })
  .strict();

/** The Outstanding view spans every month, so it takes no month — only paging and the same search / status filters. */
export const outstandingQuerySchema = z
  .object({
    page: z.coerce.number().int("page must be a whole number.").min(1, "page must be 1 or more.").max(1_000_000).default(1),
    pageSize: z.coerce
      .number()
      .int("pageSize must be a whole number.")
      .min(1, "pageSize must be 1 or more.")
      .max(MAX_PAGE_SIZE, `pageSize must be at most ${MAX_PAGE_SIZE}.`)
      .default(DEFAULT_PAGE_SIZE),
    search: z.string().trim().max(100).optional(),
    projectStatus: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

export const trackerChainQuerySchema = z.object({ month }).strict();

export const trackerProjectParamSchema = z.object({ projectId: z.string().uuid("Project ID must be a valid UUID.") });

export type TrackerListQuery = z.infer<typeof trackerListQuerySchema>;
export type OutstandingQuery = z.infer<typeof outstandingQuerySchema>;

/** Parses with a schema; 400 with the first issue otherwise. */
export function parseWith<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(issue ? `${issue.path.join(".") || "query"}: ${issue.message}` : "Invalid request.", 400);
  }
  return result.data;
}
