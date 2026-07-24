import { useEffect, useRef, useState } from "react";
import { CalendarDays, Clock3, FolderKanban } from "lucide-react";
import { getDashboardMetrics } from "../../../services/dashboardService";
import { GlassReflectionOverlay } from "../../../components/ui/GlassReflectionOverlay";

interface Props {
  lastUpdated: Date;
}

/* ─────────────────────────────────────────────────────────────────
   Main HeroBar
───────────────────────────────────────────────────────────────── */
const HeroBar = ({ lastUpdated }: Props) => {
  const [today, setToday] = useState(() => new Date());
  const metrics = getDashboardMetrics();

  const [clockTick, setClockTick] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [timeVisible, setTimeVisible] = useState(true);
  const prevTimeRef = useRef(lastUpdated);

  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setTitleVisible(true), 60);
    const t2 = setTimeout(() => setSubtitleVisible(true), 210);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setClockTick(true);
      setTimeout(() => setClockTick(false), 140);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (lastUpdated !== prevTimeRef.current) {
      prevTimeRef.current = lastUpdated;
      setTimeVisible(false);
      const t = setTimeout(() => setTimeVisible(true), 300);
      return () => clearTimeout(t);
    }
  }, [lastUpdated]);

  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
  const timeStr = lastUpdated.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="pmo-hero relative overflow-hidden rounded-[var(--nu-radius-lg)] shadow-lg border border-slate-200 dark:border-slate-800">
      <GlassReflectionOverlay />

      <style dangerouslySetInnerHTML={{ __html: `

        /* ══ Hero background ════════════════════════════════════════ */
        .pmo-hero {
          border-radius: 14px;
          overflow: hidden;
          position: relative;
          background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #0E7490 100%);
        }
        html.dark .pmo-hero {
          background: linear-gradient(-45deg, #152B68 0%, #1F52C4 30%, #0B6059 65%, #0892C8 100%);
          background-size: 300% 300%;
          animation: heroGradientShift 18s ease-in-out infinite;
          border: 1px solid rgba(56,139,253,.16);
          box-shadow: 0 8px 28px rgba(0,0,0,.48);
        }
        .pmo-hero::before {
          content: '';
          position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,.030) 1px, transparent 1px);
          background-size: 22px 22px;
          pointer-events: none;
          animation: gridDrift 30s linear infinite;
        }
        .pmo-hero::after {
          content: '';
          position: absolute; left: -80px; top: -80px;
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(59,130,246,.13) 0%, transparent 68%);
          pointer-events: none;
          animation: orbFloat 16s ease-in-out infinite;
        }

        /* ══ Glass Reflection Prototype ══════════════════════════════ */
        .pmo-glass-reflection {
          position: absolute;
          top: -60%;
          left: -120%;
          width: 70%;
          height: 220%;
          background: linear-gradient(
            115deg,
            transparent 25%,
            rgba(255, 255, 255, 0.015) 40%,
            rgba(255, 255, 255, 0.07) 50%,
            rgba(255, 255, 255, 0.015) 60%,
            transparent 75%
          );
          transform: skewX(-25deg) translate3d(0, 0, 0);
          pointer-events: none;
          z-index: 1;
          will-change: transform;
          animation: heroGlassSweep 22s ease-in-out infinite;
        }

        @keyframes heroGlassSweep {
          0% {
            transform: skewX(-25deg) translate3d(0, 0, 0);
            opacity: 0;
          }
          1% {
            opacity: 0.85;
          }
          12% {
            transform: skewX(-25deg) translate3d(380%, 0, 0);
            opacity: 0.85;
          }
          13%, 100% {
            transform: skewX(-25deg) translate3d(380%, 0, 0);
            opacity: 0;
          }
        }

        @keyframes heroGradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes gridDrift {
          0%   { background-position: 0px 0px; }
          100% { background-position: 22px 22px; }
        }
        @keyframes orbFloat {
          0%,100% { transform: translate(0,0); }
          50%     { transform: translate(10px, 8px); }
        }

        /* ══ Inner wrapper ══════════════════════════════════════════ */
        .pmo-hero-in {
          position: relative; z-index: 1;
          padding: 24px 22px;
          display: flex; align-items: center;
          justify-content: space-between; gap: 20px;
          flex-wrap: wrap;
        }

        .pmo-chip-container {
          display: flex; align-items: center; justify-content: flex-end;
          flex-shrink: 0; flex-wrap: wrap; gap: 20px;
        }

        /* ══ UNIFIED CHIP BASE ══════════════════════════════════════ */
        .pmo-chip {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 14px;
          border-radius: 12px;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          background: rgba(0,0,0,.25);
          border: 1px solid rgba(255,255,255,.10);
          box-shadow: 0 1px 3px rgba(0,0,0,.18);
          flex-shrink: 0;
          cursor: default;
          transition: transform 250ms cubic-bezier(.22,.68,0,1.2), box-shadow 250ms ease, border-color 250ms ease, background 200ms ease;
          will-change: transform;
        }
        .pmo-chip:hover {
          transform: translateY(-3px);
          background: rgba(255,255,255,.10) !important;
          border-color: rgba(255,255,255,.22) !important;
          box-shadow: 0 6px 20px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.16);
        }

        .pmo-chip-icon {
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(255,255,255,.10);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .pmo-chip-label {
          font-size: 9px; font-weight: 700; letter-spacing: .08em;
          text-transform: uppercase; color: rgba(203,213,225,.65); line-height: 1;
        }
        .pmo-chip-value {
          font-size: 12.5px; font-weight: 800; color: #ffffff;
          line-height: 1; margin-top: 3px; white-space: nowrap;
        }

        /* ══ Title animations ═══════════════════════════════════════ */
        .pmo-title {
          opacity: 0; transform: translateY(10px);
          transition: opacity 450ms ease, transform 450ms ease;
        }
        .pmo-title.visible { opacity: 1; transform: translateY(0); }
        .pmo-subtitle {
          opacity: 0; transform: translateY(8px);
          transition: opacity 400ms ease 0ms, transform 400ms ease 0ms;
        }
        .pmo-subtitle.visible { opacity: 1; transform: translateY(0); }

        /* ══ Responsive Breakpoints ═════════════════════════════════ */
        @media (min-width: 1600px) {
          .pmo-hero-in, .pmo-chip-container { flex-wrap: nowrap; }
          .pmo-chip { width: 220px; }
          .pmo-hero { min-height: 170px; display: flex; align-items: center; }
        }
        @media (min-width: 1200px) and (max-width: 1599px) {
          .pmo-hero-in, .pmo-chip-container { flex-wrap: nowrap; gap: 12px; }
          .pmo-hero-in { padding: 20px 16px; }
          .pmo-chip { width: 175px; padding: 8px 10px; gap: 8px; }
          .pmo-chip-label { font-size: 8px; }
          .pmo-chip-value { font-size: 11px; }
          .pmo-title { font-size: 22px; }
          .pmo-subtitle { font-size: 11px; max-width: 500px; }
          .pmo-hero { min-height: 150px; display: flex; align-items: center; }
        }
        @media (max-width: 1199px) and (min-width: 768px) {
          .pmo-chip { width: 200px; }
        }
        @media (max-width: 767px) {
          .pmo-chip { width: 100%; }
          .pmo-chip-container { display: grid; grid-template-columns: repeat(2, 1fr); width: 100%; gap: 12px; }
        }

        /* ══ Card entrance sequence ═════════════════════════════════ */
        .pmo-card-enter {
          opacity: 0; transform: translateY(12px);
          animation: cardEnter 350ms ease forwards;
        }
        .pmo-card-enter-1 { animation-delay: 80ms;  }
        .pmo-card-enter-2 { animation-delay: 180ms; }
        .pmo-card-enter-3 { animation-delay: 280ms; }
        .pmo-card-enter-4 { animation-delay: 380ms; }
        @keyframes cardEnter {
          to { opacity: 1; transform: translateY(0); }
        }

        /* ══ System Status — green glow variant ════════════════════ */
        .pmo-chip-status {
          border-color: rgba(52,211,153,.22) !important;
          animation: statusGlow 2s ease-in-out infinite;
        }
        @keyframes statusGlow {
          0%,100% { box-shadow: 0 0 0 1px rgba(52,211,153,.06) inset, 0 1px 3px rgba(0,0,0,.14); }
          50%     { box-shadow: 0 0 0 1px rgba(52,211,153,.10) inset, 0 0 10px rgba(52,211,153,.10), 0 1px 3px rgba(0,0,0,.14); }
        }
        .pmo-live-dot {
          width: 5.5px; height: 5.5px;
          border-radius: 50%; background: #34D399;
          animation: livePulse 2s ease-in-out infinite;
          flex-shrink: 0;
        }
        @keyframes livePulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(52,211,153,.55); }
          50%     { box-shadow: 0 0 0 5px rgba(52,211,153,0);  }
        }
        .pmo-live-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 2.5px 8px; border-radius: 9999px;
          background: rgba(52,211,153,.12); border: 1px solid rgba(52,211,153,.22);
          font-size: 9px; font-weight: 700; color: #34D399; letter-spacing: .05em;
        }

        /* ══ Total Projects — blue glow variant ════════════════════
           SAME height as all other chips.
           Differentiated ONLY by border/glow/icon color — not size.
        ════════════════════════════════════════════════════════════ */
        .pmo-chip-primary {
          background: rgba(0,0,0,.28) !important;
          border-color: rgba(125,195,255,.32) !important;
          box-shadow:
            0 0 0 1px rgba(125,195,255,.07) inset,
            0 3px 20px rgba(59,130,246,.18),
            0 1px 3px rgba(0,0,0,.24);
          position: relative;
          overflow: hidden;
        }
        /* Icon ring — circular accent */
        .pmo-chip-primary .pmo-chip-icon {
          border-radius: 50%;
          background: rgba(125,195,255,.14);
          border: 1px solid rgba(125,195,255,.22);
          box-shadow: 0 0 10px rgba(99,179,237,.16);
        }
        /* Value — slightly larger but NOT taller (line-height stays 1) */
        .pmo-chip-primary .pmo-chip-value {
          font-size: 15px;
          letter-spacing: -.3px;
          animation: countGlow 4s ease-in-out infinite;
        }
        @keyframes countGlow {
          0%,100% { text-shadow: 0 0 12px rgba(147,197,253,.28); }
          50%     { text-shadow: 0 0 22px rgba(147,197,253,.55); }
        }
        /* Subtitle row — only appears on primary chip, below value */
        .pmo-chip-sub {
          font-size: 9px; font-weight: 600;
          color: rgba(147,197,253,.50); letter-spacing: .01em;
          margin-top: 2px; line-height: 1;
          animation: subBreathe 4s ease-in-out infinite;
        }
        @keyframes subBreathe {
          0%,100% { opacity: .88; }
          50%     { opacity: 1; }
        }
        /* Glass shimmer sweep */
        .pmo-chip-primary::after {
          content: '';
          position: absolute; top: 0; left: -120%;
          width: 60%; height: 100%;
          background: linear-gradient(105deg, transparent 20%, rgba(255,255,255,.05) 50%, transparent 80%);
          animation: chipShimmer 13s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes chipShimmer {
          0%,40%   { left: -120%; }
          60%,100% { left: 160%;  }
        }
        .pmo-chip-primary:hover {
          border-color: rgba(125,195,255,.48) !important;
          box-shadow:
            0 0 0 1px rgba(125,195,255,.12) inset,
            0 6px 28px rgba(59,130,246,.26),
            0 2px 6px rgba(0,0,0,.30) !important;
        }

        /* ══ Icon micro-animations ══════════════════════════════════ */
        .pmo-icon-calendar { animation: calBounce 10s ease-in-out infinite; }
        @keyframes calBounce {
          0%,8%,100% { transform: translateY(0);   }
          4%          { transform: translateY(-2px); }
          6%          { transform: translateY(0);   }
        }
        .pmo-icon-clock {
          transition: transform 80ms ease-out;
          transform-origin: center;
        }
        .pmo-icon-clock.tick { transform: rotate(5deg); }
        .pmo-icon-folder { animation: folderFloat 3s ease-in-out infinite; }
        @keyframes folderFloat {
          0%,100% { transform: translateY(0);   }
          50%     { transform: translateY(-2px); }
        }

        /* ══ Timestamp fade on refresh ══════════════════════════════ */
        .pmo-time-value {
          display: inline-block;
          transition: opacity 300ms ease;
        }
      `}} />

      {/* ── Hero inner ── */}
      <div className="pmo-hero-in">

        {/* Left: Title + Subtitle */}
        <div className="min-w-0">
          <h1 className={`pmo-title text-[22px] sm:text-[25px] lg:text-[28px] font-extrabold text-white leading-tight tracking-tight${titleVisible ? " visible" : ""}`}>
            Engineering Project Management Dashboard
          </h1>
          <p className={`pmo-subtitle text-[13px] text-slate-300 mt-1.5 max-w-2xl leading-relaxed${subtitleVisible ? " visible" : ""}`}>
            Monitor project execution, commercial performance, invoicing,
            profitability and operational health across all active engineering projects.
          </p>
        </div>

        {/* Right: Four header cards — all same height */}
        <div className="pmo-chip-container">

          {/* ① System Status */}
          <div className="pmo-chip pmo-chip-status pmo-card-enter pmo-card-enter-1">
            <div className="pmo-chip-icon">
              <span className="pmo-live-dot" />
            </div>
            <div>
              <p className="pmo-chip-label">System Status</p>
              <div className="flex items-center gap-1.5 mt-[3px]">
                <span className="pmo-live-pill">
                  <span className="pmo-live-dot" style={{ width: 5, height: 5, flexShrink: 0 }} />
                  Live
                </span>
                <span className="pmo-chip-value" style={{ marginTop: 0 }}>Online</span>
              </div>
            </div>
          </div>

          {/* ② Today */}
          <div className="pmo-chip pmo-card-enter pmo-card-enter-2">
            <div className="pmo-chip-icon">
              <span className="pmo-icon-calendar">
                <CalendarDays size={14} className="text-sky-300" />
              </span>
            </div>
            <div>
              <p className="pmo-chip-label">Today</p>
              <p className="pmo-chip-value">{dateStr}</p>
            </div>
          </div>

          {/* ③ Last Updated */}
          <div className="pmo-chip pmo-card-enter pmo-card-enter-3">
            <div className="pmo-chip-icon">
              <span className={`pmo-icon-clock${clockTick ? " tick" : ""}`}>
                <Clock3 size={14} className="text-cyan-300" />
              </span>
            </div>
            <div>
              <p className="pmo-chip-label">Last Updated</p>
              <p
                className="pmo-chip-value pmo-time-value"
                style={{ opacity: timeVisible ? 1 : 0 }}
              >
                {timeStr}
              </p>
            </div>
          </div>

          {/* ④ Total Projects — same height, blue accent only */}
          <div className="pmo-chip pmo-chip-primary pmo-card-enter pmo-card-enter-4">
            <div className="pmo-chip-icon">
              <span className="pmo-icon-folder">
                <FolderKanban size={15} className="text-sky-300" />
              </span>
            </div>
            <div>
              <p className="pmo-chip-label" style={{ color: "rgba(186,230,253,.72)" }}>
                Total Projects
              </p>
              <p className="pmo-chip-value">{metrics.totalProjects}</p>
              <p className="pmo-chip-sub">Engineering Portfolio</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default HeroBar;
