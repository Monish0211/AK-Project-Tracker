import type { ReactNode } from "react";
import { StatTile, type StatTileTint } from "../../../../components/ui/StatTile";

export interface SummaryTileConfig {
  key: string;
  label: string;
  value: string;
  icon: ReactNode;
  tint?: StatTileTint;
}

interface SummaryCardsProps {
  tiles: SummaryTileConfig[];
  /** Tailwind grid-cols override — defaults to a responsive row sized for however many tiles are passed. */
  className?: string;
}

/**
 * Generic reusable row of StatTiles — reused by both CommercialSummary (the
 * Invoice tab's top-level 6 KPIs) and ActivityDetails' smaller per-activity
 * Billing Summary (4 KPIs), so the two never drift into different tile
 * styling for the same kind of figure.
 */
export function SummaryCards({ tiles, className }: SummaryCardsProps) {
  return (
    <div className={className ?? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5"}>
      {tiles.map((tile) => (
        <StatTile key={tile.key} label={tile.label} value={tile.value} icon={tile.icon} tint={tile.tint ?? "accent"} />
      ))}
    </div>
  );
}
