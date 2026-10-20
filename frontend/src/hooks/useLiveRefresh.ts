import { useCallback, useEffect, useState } from "react";
import { pmoDataChangedMatches, type PmoEntity } from "../utils/pmoDataChanged";

/**
 * Keeps a page reactive to the existing data repositories (projects,
 * invoices, customers, ...). Each service dispatches "pmo:data-changed"
 * after every save, so any Add/Edit/Delete/Import anywhere in the app is
 * picked up here automatically — no polling, no duplicated data store.
 * Shared across modules (Dashboard, Customer Master, ...) rather than
 * duplicated per page.
 *
 * `entities` (optional, Oct 2026 performance audit) limits the refresh to
 * events about those kinds of data — e.g. the Dashboard ignores the
 * employee/reminder/user cache loads that fire right after every page load,
 * each of which used to re-request the whole portfolio summary. Omit it to
 * keep reacting to every event, exactly as before.
 */
export const useLiveRefresh = (entities?: PmoEntity[]) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(() => new Date());

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
    setLastUpdated(new Date());
  }, []);

  const entityKey = entities ? entities.join(",") : "";
  useEffect(() => {
    const filter = entityKey ? (entityKey.split(",") as PmoEntity[]) : undefined;
    const onChange = (event: Event) => {
      if (pmoDataChangedMatches(event, filter)) refresh();
    };
    window.addEventListener("pmo:data-changed", onChange);
    return () => window.removeEventListener("pmo:data-changed", onChange);
  }, [refresh, entityKey]);

  return { refreshKey, lastUpdated, refresh };
};
