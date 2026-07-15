import { useCallback, useEffect, useState } from "react";

/**
 * Keeps a page reactive to the existing data repositories (projects,
 * invoices, customers, ...). Each service dispatches "pmo:data-changed"
 * after every save, so any Add/Edit/Delete/Import anywhere in the app is
 * picked up here automatically — no polling, no duplicated data store.
 * Shared across modules (Dashboard, Customer Master, ...) rather than
 * duplicated per page.
 */
export const useLiveRefresh = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(() => new Date());

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    window.addEventListener("pmo:data-changed", refresh);
    return () => window.removeEventListener("pmo:data-changed", refresh);
  }, [refresh]);

  return { refreshKey, lastUpdated, refresh };
};
