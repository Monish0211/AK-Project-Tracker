import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRaisedBreakdown, type RaisedBreakdownPage } from "../../services/invoiceTrackerService";
import { ApiError } from "../../services/apiClient";
import { deriveBreakdown, requestKeyOf, type BreakdownQuery } from "./raisedBreakdownLogic";

const PAGE_SIZE = 25;
const errorText = (err: unknown): string => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");

/**
 * Loads the Raised-amount breakdown ONLY while its dialog is open, and only once per request key (month, filters, page refresh, retry): closing and
 * reopening reuses what it already has; a changed month / filter / refresh asks again. A response that arrives after the request changed is dropped.
 * More projects are fetched on demand ("Show more projects"); the whole-report figures come with every page. Nothing is stored outside React state.
 */
export function useRaisedBreakdown(query: BreakdownQuery, enabled: boolean, refreshKey: number) {
  const { month, search, projectStatus, filter } = query;
  const [tick, setTick] = useState(0);
  const requestKey = requestKeyOf(query, refreshKey, tick);
  const [first, setFirst] = useState<{ key: string; data: RaisedBreakdownPage | null; error: string | null } | null>(null);
  const [more, setMore] = useState<{ key: string; pages: RaisedBreakdownPage[]; loading: boolean; error: string | null }>({ key: "", pages: [], loading: false, error: null });
  const moreInFlight = useRef(false);
  const answered = first?.key === requestKey;

  useEffect(() => {
    if (!enabled || answered) return;
    let active = true;
    fetchRaisedBreakdown({ month, page: 1, pageSize: PAGE_SIZE, search, projectStatus, filter })
      .then((data) => {
        if (active) setFirst({ key: requestKey, data, error: null });
      })
      .catch((err: unknown) => {
        if (active) setFirst({ key: requestKey, data: null, error: errorText(err) });
      });
    return () => {
      active = false; // anything still in flight is now stale
    };
  }, [enabled, answered, requestKey, month, search, projectStatus, filter]);

  const extra = more.key === requestKey ? more : null;
  const pages = answered && first?.data ? [first.data, ...(extra?.pages ?? [])] : [];
  const last = pages[pages.length - 1];
  const nextPage = last && last.page < last.totalPages ? last.page + 1 : 0; // 0 = nothing more to load

  const loadMore = useCallback(() => {
    if (nextPage === 0 || moreInFlight.current) return;
    moreInFlight.current = true;
    const forKey = requestKey;
    const prior = more.key === forKey ? more.pages : [];
    setMore({ key: forKey, pages: prior, loading: true, error: null });
    fetchRaisedBreakdown({ month, page: nextPage, pageSize: PAGE_SIZE, search, projectStatus, filter })
      .then((data) => setMore({ key: forKey, pages: [...prior, data], loading: false, error: null }))
      .catch((err: unknown) => setMore({ key: forKey, pages: prior, loading: false, error: errorText(err) }))
      .finally(() => {
        moreInFlight.current = false;
      });
  }, [nextPage, more, requestKey, month, search, projectStatus, filter]);

  const retry = useCallback(() => setTick((t) => t + 1), []);

  const data = deriveBreakdown({ enabled, answered, pages, error: first?.error ?? null, loadingMore: !!extra?.loading, moreError: extra?.error ?? null });
  return { data, loadMore, retry };
}
