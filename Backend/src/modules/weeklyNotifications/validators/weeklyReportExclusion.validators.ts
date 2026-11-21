import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../weeklyPaging.js";
import { REPORT_TYPES } from "../services/weeklyReportExclusion.service.js";

/** POST /notification-settings/report-exclusions - exclude one project from one weekly report. */
export const createExclusionSchema = z
  .object({
    reportType: z.enum(REPORT_TYPES),
    projectId: z.string().trim().min(1, "projectId is required.").max(64),
  })
  .strict();
export type CreateExclusionBody = z.infer<typeof createExclusionSchema>;

/** GET /notification-settings/report-exclusions?reportType=&status=&page=&pageSize= - Excluded History. */
export const listExclusionsQuerySchema = z
  .object({
    reportType: z.enum(REPORT_TYPES),
    status: z.enum(["active", "restored", "all"]).default("all"),
    page: z.coerce.number().int("page must be a whole number.").min(1, "page must be 1 or more.").max(1_000_000).default(1),
    pageSize: z.coerce
      .number()
      .int("pageSize must be a whole number.")
      .min(1, "pageSize must be 1 or more.")
      .max(MAX_PAGE_SIZE, `pageSize must be at most ${MAX_PAGE_SIZE}.`)
      .default(DEFAULT_PAGE_SIZE),
  })
  .strict();
