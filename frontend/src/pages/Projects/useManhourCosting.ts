import { useCallback, useEffect, useRef, useState } from "react";
import { getProjectManhourCosting } from "../../services/manhourCostingService";
import type { ManhourCosting } from "../../utils/manhourCosting";
import { pmoDataChangedMatches } from "../../utils/pmoDataChanged";

export interface ManhourCostingState {
  /** The authoritative backend costing for the project; null until it has loaded. */
  costing: ManhourCosting | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface Loaded {
  key: string;
  costing: ManhourCosting | null;
  error: string | null;
}

/**
 * Phase 4 / Option A - loads the project's central manpower costing and reloads it whenever the data it depends on changes (an employee's rate, a project
 * save such as an FX apply, a timesheet import), so a changed rate shows everywhere without a page reload. A figure loaded for another project is never used.
 */
export function useManhourCosting(projectId: string | undefined): ManhourCostingState {
  const [tick, setTick] = useState(0);
  const key = `${projectId ?? ""}:${tick}`;
  const [loaded, setLoaded] = useState<Loaded>({ key: "", costing: null, error: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    getProjectManhourCosting(projectId)
      .then((costing) => {
        if (!cancelled) setLoaded({ key, costing, error: null });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, costing: null, error: "Could not load the manpower costing." });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, key]);

  useEffect(() => {
    const onChange = (event: Event) => {
      if (!pmoDataChangedMatches(event, ["employee", "project", "timesheet"])) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setTick((n) => n + 1), 300);
    };
    window.addEventListener("pmo:data-changed", onChange);
    return () => {
      window.removeEventListener("pmo:data-changed", onChange);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const current = loaded.costing && loaded.costing.projectId === projectId ? loaded.costing : null;
  return { costing: current, loading: Boolean(projectId) && loaded.key !== key, error: loaded.error, reload };
}
