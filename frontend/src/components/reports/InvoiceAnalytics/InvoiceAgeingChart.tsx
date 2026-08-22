import { useMemo, useState } from "react";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  ageing: Record<string, number>;
}

interface BucketConfig {
  key: string;
  label: string;
  color: string;
}

const AGEING_CONFIG: BucketConfig[] = [
  { key: "0-30 Days", label: "0-30 Days", color: "#10b981" }, // Green
  { key: "31-60 Days", label: "31-60 Days", color: "#3b82f6" }, // Blue
  { key: "61-90 Days", label: "61-90 Days", color: "#f59e0b" }, // Orange
  { key: "90+ Days", label: "90+ Days", color: "#ef4444" },   // Red
];

interface SliceItem {
  key: string;
  label: string;
  color: string;
  value: number;
  percentage: number;
  amountStr: string;
  pctStr: string;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  pathD: string;
  anchorX: number;
  anchorY: number;
}

interface PositionedLabel {
  item: SliceItem;
  side: "left" | "right";
  anchorX: number;
  anchorY: number;
  elbowX: number;
  elbowY: number;
  endX: number;
  endY: number;
  textX: number;
  textY: number;
}

export function InvoiceAgeingChart({ ageing }: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const { slices, labels } = useMemo(() => {
    const rawItems = AGEING_CONFIG.map((cfg) => ({
      ...cfg,
      value: ageing[cfg.key] || 0,
    }));

    const total = rawItems.reduce((acc, curr) => acc + curr.value, 0);

    // Calculate percentage and display string
    const processed = rawItems.map((item) => {
      const pct = total > 0 ? (item.value / total) * 100 : 0;
      const amountStr = item.value === 0 ? "₹ 0.00" : formatBusinessINR(item.value);
      const pctStr = `(${pct.toFixed(2)}%)`;
      return {
        ...item,
        percentage: pct,
        amountStr,
        pctStr,
      };
    });

    // Donut Geometry settings
    const cx = 360;
    const cy = 130;
    const innerRadius = 52;
    const outerRadius = 88;
    const gapDeg = 3;
    const minSliceDeg = 14;
    const availableDeg = 360 - rawItems.length * gapDeg;

    // Visual angle allocation: small/zero slices get a minimum visible arc
    const zeroOrTiny = processed.filter((p) => p.percentage < 3.5);
    const regular = processed.filter((p) => p.percentage >= 3.5);
    const reservedDeg = zeroOrTiny.length * minSliceDeg;
    const regularAvailableDeg = Math.max(0, availableDeg - reservedDeg);
    const regularTotalValue = regular.reduce((acc, curr) => acc + curr.value, 0);

    const allocated = processed.map((p) => {
      if (total === 0) {
        return { ...p, angleDeg: availableDeg / processed.length };
      }
      if (p.percentage < 3.5) {
        return { ...p, angleDeg: minSliceDeg };
      }
      const angle = (p.value / regularTotalValue) * regularAvailableDeg;
      return { ...p, angleDeg: Math.max(minSliceDeg, angle) };
    });

    const sumAllocated = allocated.reduce((acc, curr) => acc + curr.angleDeg, 0);
    const normalized = allocated.map((a) => ({
      ...a,
      angleDeg: (a.angleDeg / sumAllocated) * availableDeg,
    }));

    // Start angle: 0-30 Days starts bottom-right (+25°), sweeping clockwise
    // Blue (31-60) dominates the left half, Orange and Red take the upper/middle right.
    let currAngle = 25;
    const sliceList: SliceItem[] = normalized.map((item) => {
      const startAngle = currAngle + gapDeg / 2;
      const endAngle = startAngle + item.angleDeg;
      const midAngle = (startAngle + endAngle) / 2;
      currAngle += item.angleDeg + gapDeg;

      // Arc path calculation
      const radStart = (startAngle * Math.PI) / 180;
      const radEnd = (endAngle * Math.PI) / 180;
      const radMid = (midAngle * Math.PI) / 180;

      const xOutStart = cx + outerRadius * Math.cos(radStart);
      const yOutStart = cy + outerRadius * Math.sin(radStart);
      const xOutEnd = cx + outerRadius * Math.cos(radEnd);
      const yOutEnd = cy + outerRadius * Math.sin(radEnd);

      const xInEnd = cx + innerRadius * Math.cos(radEnd);
      const yInEnd = cy + innerRadius * Math.sin(radEnd);
      const xInStart = cx + innerRadius * Math.cos(radStart);
      const yInStart = cy + innerRadius * Math.sin(radStart);

      const largeArcFlag = item.angleDeg > 180 ? 1 : 0;

      const pathD = [
        `M ${xOutStart.toFixed(2)} ${yOutStart.toFixed(2)}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${xOutEnd.toFixed(2)} ${yOutEnd.toFixed(2)}`,
        `L ${xInEnd.toFixed(2)} ${yInEnd.toFixed(2)}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${xInStart.toFixed(2)} ${yInStart.toFixed(2)}`,
        "Z",
      ].join(" ");

      const anchorX = cx + outerRadius * Math.cos(radMid);
      const anchorY = cy + outerRadius * Math.sin(radMid);

      return {
        ...item,
        startAngle,
        endAngle,
        midAngle,
        pathD,
        anchorX,
        anchorY,
      };
    });

    // Compute Non-Overlapping Label Positions with Leader Lines
    const leftGroup: { item: SliceItem; naturalY: number }[] = [];
    const rightGroup: { item: SliceItem; naturalY: number }[] = [];

    sliceList.forEach((slice) => {
      const rad = (slice.midAngle * Math.PI) / 180;
      const cosVal = Math.cos(rad);
      if (cosVal < -0.1) {
        leftGroup.push({ item: slice, naturalY: slice.anchorY });
      } else {
        rightGroup.push({ item: slice, naturalY: slice.anchorY });
      }
    });

    // Vertical spacing relaxation algorithm
    const minSpacing = 42; // Minimum vertical pixel distance between labels

    const relaxYPositions = (group: { item: SliceItem; naturalY: number }[]) => {
      if (group.length === 0) return [];
      group.sort((a, b) => a.naturalY - b.naturalY);

      const result = group.map((g) => ({ ...g, y: g.naturalY }));

      // If multiple items, center them nicely around natural centroid
      if (result.length > 1) {
        const totalSpan = (result.length - 1) * minSpacing;
        const avgY = result.reduce((sum, r) => sum + r.naturalY, 0) / result.length;
        let startY = avgY - totalSpan / 2;

        // Clamp inside visible bounds
        startY = Math.max(35, Math.min(235 - totalSpan, startY));

        result.forEach((r, idx) => {
          r.y = startY + idx * minSpacing;
        });
      }

      return result;
    };

    const relaxedLeft = relaxYPositions(leftGroup);
    const relaxedRight = relaxYPositions(rightGroup);

    const positionedLabels: PositionedLabel[] = [];

    relaxedLeft.forEach(({ item, y }) => {
      const anchorX = item.anchorX;
      const anchorY = item.anchorY;
      const elbowX = cx - outerRadius - 28;
      const elbowY = y;
      const endX = cx - outerRadius - 60;
      const endY = y;
      const textX = endX - 8;
      const textY = y;

      positionedLabels.push({
        item,
        side: "left",
        anchorX,
        anchorY,
        elbowX,
        elbowY,
        endX,
        endY,
        textX,
        textY,
      });
    });

    relaxedRight.forEach(({ item, y }) => {
      const anchorX = item.anchorX;
      const anchorY = item.anchorY;
      const elbowX = cx + outerRadius + 28;
      const elbowY = y;
      const endX = cx + outerRadius + 60;
      const endY = y;
      const textX = endX + 8;
      const textY = y;

      positionedLabels.push({
        item,
        side: "right",
        anchorX,
        anchorY,
        elbowX,
        elbowY,
        endX,
        endY,
        textX,
        textY,
      });
    });

    return { slices: sliceList, labels: positionedLabels, totalAmount: total };
  }, [ageing]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Accounts Receivable Ageing Breakdown
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">0-30 to 90+ Days</span>
      </div>

      {/* Donut Chart SVG Canvas */}
      <div className="w-full flex items-center justify-center relative overflow-hidden py-1">
        <svg
          viewBox="0 0 720 260"
          className="w-full h-auto max-h-[290px] select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Connector Leader Lines */}
          <g className="leader-lines">
            {labels.map((lbl) => {
              const isHovered = hoveredKey === lbl.item.key;
              const pathD = `M ${lbl.anchorX.toFixed(1)} ${lbl.anchorY.toFixed(1)} L ${lbl.elbowX.toFixed(1)} ${lbl.elbowY.toFixed(1)} L ${lbl.endX.toFixed(1)} ${lbl.endY.toFixed(1)}`;

              return (
                <g key={`leader-${lbl.item.key}`}>
                  {/* Subtle outer dot at slice edge */}
                  <circle
                    cx={lbl.anchorX}
                    cy={lbl.anchorY}
                    r={2.5}
                    fill={lbl.item.color}
                    opacity={hoveredKey && !isHovered ? 0.3 : 0.9}
                  />
                  {/* Stepped Leader Line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={lbl.item.color}
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={hoveredKey && !isHovered ? 0.3 : 0.9}
                    className="transition-all duration-150"
                  />
                </g>
              );
            })}
          </g>

          {/* Donut Ring Slices */}
          <g className="donut-slices">
            {slices.map((slice) => {
              const isHovered = hoveredKey === slice.key;

              return (
                <path
                  key={`slice-${slice.key}`}
                  d={slice.pathD}
                  fill={slice.color}
                  opacity={hoveredKey ? (isHovered ? 1 : 0.4) : 0.95}
                  stroke="var(--nu-surface)"
                  strokeWidth={2}
                  className="transition-all duration-150 cursor-pointer hover:opacity-100"
                  onMouseEnter={() => setHoveredKey(slice.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                />
              );
            })}
          </g>

          {/* Non-overlapping Text Labels */}
          <g className="slice-labels">
            {labels.map((lbl) => {
              const isHovered = hoveredKey === lbl.item.key;
              const textAnchor = lbl.side === "left" ? "end" : "start";

              return (
                <text
                  key={`label-${lbl.item.key}`}
                  x={lbl.textX}
                  y={lbl.textY}
                  textAnchor={textAnchor}
                  fill={lbl.item.color}
                  opacity={hoveredKey && !isHovered ? 0.35 : 1}
                  className="cursor-pointer transition-opacity duration-150"
                  onMouseEnter={() => setHoveredKey(lbl.item.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  <tspan
                    x={lbl.textX}
                    dy="-3"
                    className="font-bold text-[11px] font-mono tracking-tight"
                  >
                    {`${lbl.item.label}: ${lbl.item.amountStr}`}
                  </tspan>
                  <tspan
                    x={lbl.textX}
                    dy="14"
                    className="font-semibold text-[10px] font-mono opacity-90"
                  >
                    {lbl.item.pctStr}
                  </tspan>
                </text>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 border-t border-[var(--nu-border)]">
        {AGEING_CONFIG.map((cfg) => {
          const val = ageing[cfg.key] || 0;
          const isHovered = hoveredKey === cfg.key;

          return (
            <div
              key={`legend-${cfg.key}`}
              className={`flex items-center gap-2 text-xs font-semibold cursor-pointer transition-all duration-150 ${
                hoveredKey && !isHovered ? "opacity-35" : "opacity-100"
              }`}
              onMouseEnter={() => setHoveredKey(cfg.key)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              <span
                className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: cfg.color }}
              />
              <span className="font-mono text-[var(--nu-text)]">{cfg.label}</span>
              <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">
                ({val === 0 ? "₹ 0.00" : formatBusinessINR(val)})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
