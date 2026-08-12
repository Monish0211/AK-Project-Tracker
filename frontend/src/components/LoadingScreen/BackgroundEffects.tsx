/**
 * Blueprint grid + CAD schematic lines + soft glow orbs + floating
 * particles/technical nodes — the ambient layer behind the rotating
 * carousel. Kept at low opacity throughout so it reads as texture, never
 * competing with the carousel/logo for attention. Pure CSS/SVG, no images,
 * so this layer costs nothing extra to load.
 */

interface BackgroundEffectsProps {
  reducedMotion: boolean;
}

// Deterministic particle field — same seed every render, no Math.random()
// needed at runtime.
const PARTICLES = Array.from({ length: 18 }).map((_, i) => ({
  id: i,
  size: 2 + (i % 3),
  left: `${((i * 19) % 94) + 2}%`,
  top: `${((i * 29) % 88) + 4}%`,
  opacity: 0.12 + (i % 5) * 0.05,
  duration: 6 + (i % 6) * 1.5,
  delay: (i % 5) * 0.7,
}));

// A handful of small "technical node" markers — a dot with a thin
// connecting tick, scattered around the frame, pulsing independently.
const NODES = Array.from({ length: 7 }).map((_, i) => ({
  id: i,
  left: `${((i * 31) % 86) + 6}%`,
  top: `${((i * 41) % 80) + 8}%`,
  delay: (i % 4) * 0.5,
}));

export default function BackgroundEffects({ reducedMotion }: BackgroundEffectsProps) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Base wash — soft white/steel in light mode, deep navy in dark */}
      <div className="absolute inset-0 bg-[#F4F7FB] dark:bg-[#060B16]" />

      {/* Blueprint grid */}
      <div
        className="absolute inset-0 opacity-[0.055] dark:opacity-[0.09]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(37,99,235,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      {/* Finer dotted sub-grid, CAD-style */}
      <div
        className="absolute inset-0 opacity-[0.05] dark:opacity-[0.08]"
        style={{
          backgroundImage: "radial-gradient(rgba(14,116,144,0.7) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Soft glow orbs */}
      <div className="absolute -top-24 -left-16 w-[420px] h-[420px] rounded-full bg-blue-500/10 dark:bg-cyan-500/12 blur-[130px]" />
      <div className="absolute bottom-[-10%] right-[-6%] w-[460px] h-[460px] rounded-full bg-cyan-400/10 dark:bg-blue-600/14 blur-[140px]" />

      {/* Faint CAD schematic line-art — decorative isometric pipe/frame outline, top-left and bottom-right corners only, so it never sits behind the carousel */}
      <svg
        className="absolute top-6 left-6 w-40 h-40 opacity-[0.14] dark:opacity-[0.16] text-blue-600 dark:text-cyan-400"
        viewBox="0 0 200 200"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
      >
        <path d="M20 160 L20 60 L60 40 L60 120" />
        <path d="M60 80 L100 60 L100 140 L60 160" />
        <circle cx="20" cy="60" r="4" />
        <circle cx="100" cy="60" r="4" />
        <path d="M100 100 L150 100 L150 170" strokeDasharray="4 4" />
      </svg>
      <svg
        className="absolute bottom-6 right-6 w-44 h-44 opacity-[0.14] dark:opacity-[0.16] text-cyan-600 dark:text-blue-400"
        viewBox="0 0 200 200"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
      >
        <rect x="30" y="30" width="60" height="60" rx="3" />
        <path d="M90 60 L160 60 L160 150" strokeDasharray="4 4" />
        <circle cx="160" cy="150" r="5" />
        <path d="M60 90 L60 160 L130 160" />
      </svg>

      {/* Floating particles */}
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className={`absolute rounded-full bg-blue-500/70 dark:bg-cyan-400/80 ${reducedMotion ? "" : "ls-float"}`}
          style={{
            width: p.size,
            height: p.size,
            left: p.left,
            top: p.top,
            opacity: p.opacity,
            animationDuration: reducedMotion ? undefined : `${p.duration}s`,
            animationDelay: reducedMotion ? undefined : `${p.delay}s`,
          }}
        />
      ))}

      {/* Floating technical nodes — small dot + tick mark, independently pulsing */}
      {NODES.map((n) => (
        <span
          key={n.id}
          className="absolute"
          style={{ left: n.left, top: n.top }}
        >
          <span
            className={`block w-[7px] h-[7px] rounded-full border border-blue-500/50 dark:border-cyan-400/60 ${
              reducedMotion ? "opacity-40" : "ls-node-pulse"
            }`}
            style={{ animationDelay: reducedMotion ? undefined : `${n.delay}s` }}
          />
        </span>
      ))}
    </div>
  );
}
