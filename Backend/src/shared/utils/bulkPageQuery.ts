import type { Request } from "express";
import { z } from "zod";
import { AppError } from "./AppError.js";

/**
 * page/pageSize for the bulk, cross-project child-collection reads that
 * feed Reports (GET /projects/expenses, GET /projects/quantity) — always
 * paginated, same bounds as GET /projects/resources' listResourcesQuerySchema.
 */
export const BULK_PAGE_SIZE_DEFAULT = 500;
export const BULK_PAGE_SIZE_MAX = 2000;

export const bulkPageQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(BULK_PAGE_SIZE_MAX, `pageSize cannot exceed ${BULK_PAGE_SIZE_MAX}.`).optional(),
});

export interface BulkPage {
  page: number;
  pageSize: number;
}

/** Query params aren't covered by the shared validate() middleware (body only) — same manual-safeParse convention as the resource controller. */
export function parseBulkPageQuery(req: Request): BulkPage {
  const result = bulkPageQuerySchema.safeParse(req.query);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new AppError(firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Invalid query parameters.", 400);
  }
  return { page: result.data.page ?? 1, pageSize: result.data.pageSize ?? BULK_PAGE_SIZE_DEFAULT };
}
