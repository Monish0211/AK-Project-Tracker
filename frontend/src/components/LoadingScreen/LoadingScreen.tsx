import { useEffect, useRef, useState } from "react";
import BackgroundEffects from "./BackgroundEffects";
import RotatingCarousel from "./RotatingCarousel";
import LoadingMessages from "./LoadingMessages";
import ProgressIndicator from "./ProgressIndicator";
import "./loading.css";

interface LoadingScreenProps {
  /** Fired once the fade-out transition finishes — the caller unmounts this component from that callback. */
  onComplete?: () => void;
  /** Time in ms for progress to reach 100%. Default matches the portal's previous loading screen duration. */
  durationMs?: number;
}

/**
 * Premium, cinematic-but-corporate loading experience shown before Login.
 * Progress is driven by a single requestAnimationFrame loop keyed off
 * elapsed wall-clock time (never a step counter), which is what guarantees
 * it can only move forward and lands on exactly 100 — every child component
 * (ProgressIndicator, RotatingCarousel, LoadingMessages) is purely
 * presentational and owns no timing decisions of its own beyond its own
 * decorative animations.
 */
export default function LoadingScreen({ onComplete, durationMs = 2800 }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    let rafId: number;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress((prev) => Math.max(prev, pct));
      if (pct < 100) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [durationMs]);

  // Fade out once progress reaches 100, then hand control back to the
  // caller — this is the "smooth fade transition into Login page, no
  // flickering, no sudden page refresh" step.
  useEffect(() => {
    if (progress < 100 || hasCompletedRef.current) return;
    hasCompletedRef.current = true;

    setIsExiting(true);
    const exitTimer = window.setTimeout(() => {
      onComplete?.();
    }, 550);

    return () => window.clearTimeout(exitTimer);
  }, [progress, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[9999] overflow-hidden select-none transition-all duration-500 ease-in-out ${
        isExiting ? "opacity-0 scale-[1.02]" : "opacity-100 scale-100"
      }`}
    >
      <BackgroundEffects reducedMotion={reducedMotion} />

      <div className="relative z-10 h-full w-full flex flex-col items-center justify-center gap-7 px-6">
        <RotatingCarousel reducedMotion={reducedMotion} />

        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-cyan-950/60 border border-blue-200 dark:border-cyan-500/30 text-blue-700 dark:text-cyan-300 text-[10px] font-extrabold tracking-[0.2em] uppercase shadow-xs">
            <span className={`w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-cyan-400 ${reducedMotion ? "" : "animate-ping"}`} />
            PMO Portal Enterprise
          </div>
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
            Engineering Project Management Office
          </h2>
        </div>

        <div className="w-full flex flex-col items-center gap-3.5">
          <LoadingMessages reducedMotion={reducedMotion} />
          <ProgressIndicator progress={progress} reducedMotion={reducedMotion} />
        </div>
      </div>

      <div className="absolute bottom-5 inset-x-0 flex items-center justify-between px-8 text-[10px] font-mono text-slate-400 dark:text-slate-600 border-t border-slate-200/70 dark:border-slate-900/80 pt-3 max-w-4xl mx-auto">
        <span>iFluids Engineering</span>
        <span className="hidden sm:inline">60 FPS Motion</span>
        <span className="text-blue-600/70 dark:text-cyan-500/70 font-semibold">PMO Portal Enterprise</span>
      </div>
    </div>
  );
}
