import { useEffect, useState } from "react";
import { Logo } from "../ui/Logo";
import offshorePlatformSunset from "../../assets/loading/offshore-platform-sunset.webp";
import pipelineFacilitySunset from "../../assets/loading/pipeline-facility-sunset.webp";
import storageTanksDusk from "../../assets/loading/storage-tanks-dusk.webp";
import refineryCoastalPlant from "../../assets/loading/refinery-coastal-plant.webp";
import oilGasInspection from "../../assets/loading/oil-gas-inspection.webp";
import offshoreFpsoPlatform from "../../assets/loading/offshore-fpso-platform.webp";
import engineeringDesignReview from "../../assets/loading/engineering-design-review.webp";
import processPlantControlRoom from "../../assets/loading/process-plant-control-room.webp";

interface RotatingCarouselProps {
  reducedMotion: boolean;
}

/**
 * Real engineering photographs — locally optimized WebP copies (560x560,
 * ~20-45KB each) downloaded from iFluids Engineering's own Services site
 * and its WordPress media library, never hotlinked. See
 * frontend/src/assets/loading/ — add more optimized photos there and to
 * this array to widen the rotation; nothing else here needs to change.
 */
const CAROUSEL_IMAGES = [
  { src: offshorePlatformSunset, alt: "Offshore platform at dusk" },
  { src: pipelineFacilitySunset, alt: "Industrial piping system at sunset" },
  { src: storageTanksDusk, alt: "Storage tank farm at dusk" },
  { src: refineryCoastalPlant, alt: "Refinery and coastal process plant" },
  { src: oilGasInspection, alt: "Engineers inspecting oil and gas piping" },
  { src: offshoreFpsoPlatform, alt: "Offshore FPSO platform" },
  { src: engineeringDesignReview, alt: "Engineers reviewing a P&ID" },
  { src: processPlantControlRoom, alt: "Process plant control room" },
];

const SEGMENT_COUNT = CAROUSEL_IMAGES.length;
const IMAGE_CYCLE_MS = 4200;

interface CarouselSegmentProps {
  angleDeg: number;
  startIndex: number;
  staggerMs: number;
  reducedMotion: boolean;
}

/**
 * Each tile cycles through every photo (staggered per tile so they never
 * crossfade in unison) — "images fade elegantly while rotating, no abrupt
 * transitions" — while independently: staying upright as it orbits
 * (counter-rotation), gently scaling (image-scale-pulse), and sitting in
 * front of its own soft glow.
 */
function CarouselSegment({ angleDeg, startIndex, staggerMs, reducedMotion }: CarouselSegmentProps) {
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (reducedMotion) return;

    let intervalId: number | undefined;
    const startTimeout = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        setIndex((i) => (i + 1) % CAROUSEL_IMAGES.length);
      }, IMAGE_CYCLE_MS);
    }, staggerMs);

    return () => {
      window.clearTimeout(startTimeout);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [reducedMotion, staggerMs]);

  return (
    <div
      className="absolute top-1/2 left-1/2"
      style={{
        width: "var(--ls-seg)",
        height: "var(--ls-seg)",
        transform: `rotate(${angleDeg}deg) translate(var(--ls-radius)) rotate(${-angleDeg}deg) translate(-50%, -50%)`,
      }}
    >
      {/* Soft glow behind the tile */}
      <div
        className={`absolute -inset-[14%] rounded-full blur-lg bg-blue-400/30 dark:bg-cyan-400/35 ${reducedMotion ? "" : "ls-tile-glow"}`}
        style={{ animationDelay: reducedMotion ? undefined : `${staggerMs}ms` }}
      />

      <div className={`relative w-full h-full ${reducedMotion ? "" : "ls-carousel-counter"}`}>
        <div
          className={`w-full h-full rounded-2xl overflow-hidden shadow-[0_10px_28px_rgba(15,23,42,0.28)] ring-1 ring-white/70 dark:ring-cyan-400/20 ${
            reducedMotion ? "" : "ls-image-scale"
          }`}
          style={{ animationDelay: reducedMotion ? undefined : `${staggerMs}ms` }}
        >
          <div className="relative w-full h-full">
            {CAROUSEL_IMAGES.map((img, i) => (
              <img
                key={img.src}
                src={img.src}
                alt={img.alt}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[1400ms] ease-in-out"
                style={{ opacity: i === index ? 1 : 0 }}
              />
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/25 via-transparent to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RotatingCarousel({ reducedMotion }: RotatingCarouselProps) {
  const segments = Array.from({ length: SEGMENT_COUNT }, (_, i) => ({
    angleDeg: (360 / SEGMENT_COUNT) * i,
    startIndex: i,
    staggerMs: (i * IMAGE_CYCLE_MS) / SEGMENT_COUNT,
  }));

  return (
    <div
      className="relative flex items-center justify-center ls-scale-in"
      style={{
        width: "clamp(300px, 60vw, 460px)",
        height: "clamp(300px, 60vw, 460px)",
      }}
    >
      {/* Ambient pulse behind the logo */}
      <div className={`absolute w-[44%] h-[44%] rounded-full bg-blue-500/15 dark:bg-cyan-500/20 blur-3xl ${reducedMotion ? "" : "ls-pulse-glow"}`} />

      {/* Outer glowing rings — independent slow rotation, purely decorative */}
      <div className={`absolute w-[94%] h-[94%] rounded-full border border-blue-400/25 dark:border-cyan-400/25 border-dashed ${reducedMotion ? "" : "ls-ring-outer"}`} />
      <div className={`absolute w-[80%] h-[80%] rounded-full border border-cyan-500/25 dark:border-blue-400/25 ${reducedMotion ? "" : "ls-ring-inner"}`}>
        <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.9)]" />
      </div>

      {/* Rotating engineering showcase ring */}
      <div
        className={`absolute inset-0 ${reducedMotion ? "" : "ls-carousel-ring"}`}
        style={
          {
            "--ls-radius": "clamp(128px, 27vw, 205px)",
            "--ls-seg": "clamp(64px, 12.5vw, 96px)",
          } as React.CSSProperties
        }
      >
        {segments.map((seg) => (
          <CarouselSegment
            key={seg.angleDeg}
            angleDeg={seg.angleDeg}
            startIndex={seg.startIndex}
            staggerMs={seg.staggerMs}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>

      {/* Center logo card — unchanged */}
      <div className="relative z-10 backdrop-blur-xl bg-white/90 dark:bg-slate-900/80 border border-blue-200/70 dark:border-cyan-500/25 rounded-3xl px-7 py-6 sm:px-9 sm:py-7 shadow-[0_10px_40px_rgba(15,23,42,0.12)] dark:shadow-[0_0_50px_rgba(6,182,212,0.15)] flex items-center justify-center overflow-hidden">
        {!reducedMotion && (
          <div
            className="absolute inset-0 pointer-events-none ls-shimmer-sweep"
            style={{
              background: "linear-gradient(to right, transparent, rgba(255,255,255,0.5), transparent)",
              width: "50%",
            }}
          />
        )}
        <Logo
          alt="iFluids Engineering"
          imageClassName="h-11 sm:h-14 w-auto object-contain"
          darkImageClassName="h-14 sm:h-18 w-auto object-contain"
          containerClassName="px-0 py-0"
        />
      </div>
    </div>
  );
}
