export type HealthStatus = "Healthy" | "Warning" | "Critical";

interface Props {
  profitMargin: number;
  hasRevenue: boolean;
  pendingQtyPercentage: number;
}

/**
 * Visual-only classification derived from figures the app already computes
 * (profit margin, pending quantity %) — introduces no new calculation.
 */
export const getProjectHealthStatus = ({ profitMargin, hasRevenue, pendingQtyPercentage }: Props): HealthStatus => {
  if (hasRevenue && profitMargin < 0) return "Critical";
  if (pendingQtyPercentage > 60) return "Warning";
  if (hasRevenue && profitMargin < 10) return "Warning";
  return "Healthy";
};
