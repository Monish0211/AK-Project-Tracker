import { createContext, useContext } from "react";
import type { DashboardSummary } from "../../services/dashboardSummaryService";

const DashboardSummaryContext = createContext<DashboardSummary | null>(null);

export const DashboardSummaryProvider = DashboardSummaryContext.Provider;

export function useDashboardSummary(): DashboardSummary {
  const value = useContext(DashboardSummaryContext);
  if (!value) {
    throw new Error("useDashboardSummary must be used under DashboardSummaryProvider");
  }
  return value;
}
