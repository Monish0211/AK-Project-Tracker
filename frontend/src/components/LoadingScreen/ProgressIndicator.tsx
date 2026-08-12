interface ProgressIndicatorProps {
  progress: number;
  reducedMotion: boolean;
}

/**
 * Purely presentational — receives the current 0-100 value from
 * LoadingScreen (which owns the single requestAnimationFrame loop driving
 * it) rather than running its own timer. That's what guarantees "never
 * jumps backward, finishes at exactly 100%": there is exactly one source of
 * truth for the number.
 */
export default function ProgressIndicator({ progress, reducedMotion }: ProgressIndicatorProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="w-64 sm:w-80 flex flex-col items-center gap-2">
      <div className="relative w-full h-2 rounded-full bg-slate-200/70 dark:bg-slate-900/90 border border-blue-200/60 dark:border-cyan-900/50 p-0.5 overflow-hidden shadow-[0_0_15px_rgba(37,99,235,0.12)] dark:shadow-[0_0_15px_rgba(6,182,212,0.15)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 to-teal-300 shadow-[0_0_12px_rgba(34,211,238,0.85)] relative overflow-hidden transition-[width] duration-150 ease-out"
          style={{ width: `${clamped}%` }}
        >
          {!reducedMotion && (
            <span
              className="absolute inset-y-0 left-0 w-1/3 ls-progress-shimmer"
              style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.55), transparent)" }}
            />
          )}
          <span className="absolute right-0 top-0 bottom-0 w-2 rounded-full bg-white shadow-[0_0_8px_#fff]" />
        </div>
      </div>

      <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
        <span className="font-semibold uppercase tracking-wider">
          {clamped < 100 ? "System Boot" : "Ready"}
        </span>
        <span className="font-bold text-blue-600 dark:text-cyan-400 tabular-nums">{clamped}%</span>
      </div>
    </div>
  );
}
