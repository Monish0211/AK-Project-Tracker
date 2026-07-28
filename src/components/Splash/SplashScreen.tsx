import React, { useState, useEffect } from "react";
import { Logo } from "../ui/Logo";

interface SplashScreenProps {
  onComplete?: () => void;
}

const STATUS_MESSAGES = [
  "Initializing PMO Platform...",
  "Loading Engineering Workspace...",
  "Syncing Project Repository...",
  "Preparing Dashboard...",
  "Connecting Secure Services...",
];

// Generate deterministic particles for depth effect
const PARTICLES = Array.from({ length: 22 }).map((_, i) => ({
  id: i,
  size: (i % 3) + 2, // 2px, 3px, or 4px
  left: `${((i * 17) % 95) + 2}%`,
  top: `${((i * 23) % 90) + 5}%`,
  opacity: 0.15 + (i % 5) * 0.15,
  duration: 6 + (i % 7) * 2, // 6s to 18s
  delay: (i % 4) * 0.8,
  glow: i % 2 === 0,
}));

export const SplashScreen: React.FC<SplashScreenProps> = () => {
  const [progress, setProgress] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // Progress counter from 0% to 100% over ~2.6 seconds
  useEffect(() => {
    const stepTime = 26; // 26ms * 100 = 2600ms
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 1;
      });
    }, stepTime);

    return () => clearInterval(interval);
  }, []);

  // Update status message based on progress thresholds
  useEffect(() => {
    const idx = Math.min(
      Math.floor((progress / 100) * STATUS_MESSAGES.length),
      STATUS_MESSAGES.length - 1
    );
    setStatusIndex(idx);
  }, [progress]);

  // Subtle 3D tilt calculation on mouse move
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;

    const rotateX = (mouseY / (rect.height / 2)) * -10; // max 10deg tilt
    const rotateY = (mouseX / (rect.width / 2)) * 10;
    setTilt({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#050811] text-white overflow-hidden select-none">
      {/* Dynamic CSS Keyframe Animations */}
      <style>{`
        @keyframes holoSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes holoSpinRev {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes lightSweep {
          0% { transform: translateX(-150%) skewX(-20deg); }
          100% { transform: translateX(150%) skewX(-20deg); }
        }
        @keyframes particleFloat {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-24px) scale(1.15); }
        }
        @keyframes textPulse {
          0%, 100% { opacity: 0.95; }
          50% { opacity: 0.65; }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(1000%); }
        }
      `}</style>

      {/* ── Background Layer 1: Soft Animated Gradient Orbs ── */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-[140px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[550px] h-[550px] bg-cyan-500/15 rounded-full blur-[150px] pointer-events-none animate-pulse" style={{ animationDuration: '4s' }} />

      {/* ── Background Layer 2: Engineering Blueprint Grid ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(56, 189, 248, 0.4) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(56, 189, 248, 0.4) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.08]"
        style={{
          backgroundImage: "radial-gradient(rgba(56, 189, 248, 0.6) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* ── Background Layer 3: Floating 3D Particles ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full bg-cyan-400"
            style={{
              width: `${p.size}px`,
              height: `${p.size}px`,
              left: p.left,
              top: p.top,
              opacity: p.opacity,
              boxShadow: p.glow ? `0 0 8px rgba(34, 211, 238, ${p.opacity * 2})` : "none",
              animation: `particleFloat ${p.duration}s ease-in-out infinite`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* ── Main Center Content ── */}
      <div className="relative z-10 flex flex-col items-center space-y-8 max-w-md w-full px-6">
        
        {/* Holographic Ring & Logo Container with 3D Tilt */}
        <div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            perspective: "1000px",
          }}
          className="relative flex items-center justify-center p-4 cursor-pointer"
        >
          {/* Ambient Glow behind Hologram */}
          <div className="absolute w-72 h-72 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none animate-pulse" />

          {/* Holographic Outer Ring 1 (Clockwise) */}
          <div
            className="absolute w-[290px] sm:w-[320px] h-[290px] sm:h-[320px] rounded-full border border-cyan-500/20 border-dashed pointer-events-none"
            style={{ animation: "holoSpin 20s linear infinite" }}
          />

          {/* Holographic Inner Ring 2 with Tech Accents (Counter-Clockwise) */}
          <div
            className="absolute w-[250px] sm:w-[275px] h-[250px] sm:h-[275px] rounded-full border border-blue-500/30 pointer-events-none flex items-center justify-center"
            style={{ animation: "holoSpinRev 12s linear infinite" }}
          >
            {/* Tech Corner Markers */}
            <div className="absolute top-0 w-2.5 h-2.5 border-t-2 border-l-2 border-cyan-400" />
            <div className="absolute bottom-0 w-2.5 h-2.5 border-b-2 border-r-2 border-cyan-400" />
            <div className="absolute left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-cyan-400" />
            <div className="absolute right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-400" />
          </div>

          {/* 3D Glassmorphism Logo Card */}
          <div
            style={{
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(10px)`,
              transition: tilt.x === 0 && tilt.y === 0 ? "transform 0.5s ease-out" : "transform 0.1s ease-out",
            }}
            className="relative z-10 backdrop-blur-2xl bg-slate-900/75 border border-cyan-500/30 rounded-3xl p-7 sm:p-9 shadow-[0_0_50px_rgba(6,182,212,0.2)] flex items-center justify-center max-w-[260px] sm:max-w-[290px] overflow-hidden group hover:border-cyan-400/60 transition-colors"
          >
            {/* Top Border Light Sweep Accent */}
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

            {/* Internal Shimmer Sweep */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(to right, transparent, rgba(255, 255, 255, 0.4), transparent)",
                width: "50%",
                height: "100%",
                animation: "lightSweep 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite 0.5s",
              }}
            />

            {/* High-Contrast White Inner Card for Perfect Logo Visibility */}
            <div className="relative z-20 bg-white px-5 sm:px-6.5 py-3.5 sm:py-4 rounded-2xl shadow-xl border border-white/60 flex items-center justify-center">
              <Logo
                alt="iFluids Engineering PMO Logo"
                className="h-9 sm:h-11 w-auto object-contain"
              />
            </div>
          </div>
        </div>

        {/* Branding Subtitle */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[10px] font-extrabold tracking-[0.2em] uppercase shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            PMO Portal Enterprise
          </div>
          <h2 className="text-xs font-semibold text-slate-400 tracking-wider">
            Engineering Project Management Office
          </h2>
        </div>

        {/* ── Status Text & Modern Progress Bar ── */}
        <div className="w-full space-y-3.5 flex flex-col items-center">
          
          {/* Animated Status Text with Smooth Fade Transition */}
          <div className="h-6 flex items-center justify-center">
            <p
              key={statusIndex}
              className="text-xs sm:text-sm font-semibold text-cyan-200 tracking-wide transition-all duration-300 animate-in fade-in slide-in-from-bottom-1"
              style={{ animation: "textPulse 2s ease-in-out infinite" }}
            >
              {STATUS_MESSAGES[statusIndex]}
            </p>
          </div>

          {/* Futuristic Progress Track & Fill */}
          <div className="relative w-64 sm:w-80 h-2 rounded-full bg-slate-900/90 border border-cyan-900/50 p-0.5 overflow-hidden shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 to-teal-300 transition-all duration-100 ease-out shadow-[0_0_12px_rgba(34,211,238,0.9)] relative"
              style={{ width: `${progress}%` }}
            >
              {/* Leading Tip Glow */}
              <div className="absolute right-0 top-0 bottom-0 w-2 rounded-full bg-white shadow-[0_0_8px_#fff]" />
            </div>
          </div>

          {/* Numeric Readout & System Status */}
          <div className="w-64 sm:w-80 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="text-slate-500 font-semibold uppercase tracking-wider">
              {progress < 100 ? "System Boot" : "Ready"}
            </span>
            <span className="font-bold text-cyan-400 tabular-nums">
              {progress}%
            </span>
          </div>

        </div>

      </div>

      {/* ── Bottom Technical Footer ── */}
      <div className="absolute bottom-6 inset-x-0 flex items-center justify-between px-8 text-[10px] font-mono text-slate-600 border-t border-slate-900/80 pt-3 max-w-4xl mx-auto">
        <span>iFluids Technology Group</span>
        <span className="hidden sm:inline text-slate-500">
          60 FPS Motion GPU Accelerated
        </span>
        <span className="text-cyan-500/70 font-semibold">
          v1.0 Operational
        </span>
      </div>
    </div>
  );
};

export default SplashScreen;
