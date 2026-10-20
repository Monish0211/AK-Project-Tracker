/**
 * Server-side paging for the Weekly Emails preview and run-history pages
 * (Oct 2026) — pure, no I/O. The report itself is always built over the
 * complete data set (so its totals are exact); only the rows returned to the
 * browser are one page of it.
 */

export const DEFAULT_PAGE_SIZE = 25;
/** Hard ceiling on rows per response; larger requests are rejected (400), never silently served. */
export const MAX_PAGE_SIZE = 100;

export interface PageRequest {
  page: number; // 1-based
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function totalPagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * One page of an already-ordered list. A page past the end returns no items
 * (with the real total), so a client whose data shrank can step back.
 */
export function pageOf<T>(items: readonly T[], { page, pageSize }: PageRequest): Page<T> {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length, totalPages: totalPagesFor(items.length, pageSize) };
}
