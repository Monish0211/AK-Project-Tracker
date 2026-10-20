import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "../../../../services/apiClient";
import { PAGE_SIZE_OPTIONS } from "../../../../services/weeklyEmailService";

/**
 * Hooks behind the Weekly Emails Preview Report and View All Runs pages
 * (Oct 2026): server-paged loading that ignores stale responses, and page
 * state kept in the URL.
 */

export interface PagedState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Runs `fetcher` (memoize it with useCallback) whenever it or `key` changes.
 * A response that arrives after the request changed again (fast paging, a
 * new filter) or after the page was left is dropped, so the table only shows
 * the latest request's rows. The previous rows stay visible while the next
 * page loads; loading is derived (the latest result is for an older key).
 */
export function usePagedRequest<T>(fetcher: () => Promise<T>, key: string): PagedState<T> {
  const [tick, setTick] = useState(0);
  const requestKey = `${key}#${tick}`;
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    fetcher()
      .then((data) => {
        if (active) setResult({ key: requestKey, data, error: null });
      })
      .catch((err) => {
        const error = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
        if (active) setResult((prev) => ({ key: requestKey, data: prev?.data ?? null, error }));
      });
    return () => {
      active = false; // anything still in flight is now stale
    };
  }, [fetcher, requestKey]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  const current = result?.key === requestKey;
  return { data: result?.data ?? null, loading: !current, error: current ? result.error : null, retry };
}

const VALID_SIZES = new Set<number>(PAGE_SIZE_OPTIONS);

/** Page / page size (and optional filters) from the URL, so Back and Refresh keep the same page. */
export function usePageParams(filterKeys: readonly string[] = []) {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get("page"));
  const rawSize = Number(params.get("pageSize"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const pageSize = VALID_SIZES.has(rawSize) ? rawSize : PAGE_SIZE_OPTIONS[0];
  const filters: Record<string, string> = {};
  for (const k of filterKeys) filters[k] = params.get(k) ?? "";

  const update = useCallback(
    (next: { page?: number; pageSize?: number; filters?: Record<string, string> }) => {
      setParams(
        (prev) => {
          const q = new URLSearchParams(prev);
          const set = (k: string, v: string) => (v ? q.set(k, v) : q.delete(k));
          if (next.pageSize !== undefined) set("pageSize", String(next.pageSize));
          for (const [k, v] of Object.entries(next.filters ?? {})) set(k, v);
          // A new page size or filter starts again at page 1.
          set("page", String(next.page ?? (next.pageSize !== undefined || next.filters ? 1 : page)));
          return q;
        },
        { replace: true }
      );
    },
    [setParams, page]
  );
  return { page, pageSize, filters, update };
}
