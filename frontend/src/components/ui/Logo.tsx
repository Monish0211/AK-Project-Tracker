import ifeLogo from "../../assets/brand/ife-logo-256.png";
import logoLight from "../../assets/logo-light.jpg";
import logoDark from "../../assets/logo-dark.png";
import { useTheme } from "../../context/ThemeContext";

interface LogoProps {
  alt?: string;
  imageClassName?: string;
  /** "wordmark" only: overrides imageClassName for Dark Mode. Falls back to imageClassName if omitted. */
  darkImageClassName?: string;
  containerClassName?: string;
  /**
   * "ife" (default) — the IFE logo, used by the Login page. "wordmark" — the original iFluids Engineering wordmark (light / dark
   * theme files), which the loading screen keeps.
   */
  variant?: "ife" | "wordmark";
}

/**
 * Single source of truth for the iFluids logos. The artwork is imported as modules instead of referenced by hardcoded "/…" paths, so
 * Vite resolves them to the correct URL under whatever base path is active for the current build (plain "/" in dev,
 * "/AK-Project-Tracker/" on the GitHub Pages build).
 *
 * variant "ife": the IFE logo — a self-contained rounded tile (its own blue background, transparent outside its corners), so it reads the
 * same in Light and Dark Mode and needs no card, border or theme variant. Rendered at its natural aspect ratio (`object-contain`,
 * height-driven by the caller's `imageClassName`), never stretched or cropped. The master image is
 * src/assets/brand/ife-logo-master.png (unchanged, not imported); ife-logo-256.png is its optimised rendition.
 *
 * variant "wordmark": the original behaviour, unchanged — the official light-theme asset in Light Mode (on a white card) and the
 * official dark-theme asset in Dark Mode (a self-contained tile that already bakes in its own frame, so no card there, and
 * `darkImageClassName` lets a usage render it taller to offset that framing). The artwork is never recolored or filtered.
 *
 * `containerClassName` (padding/margin) applies in every case so surrounding layout spacing stays under the caller's control.
 */
export function Logo({ variant = "ife", ...props }: LogoProps) {
  return variant === "wordmark" ? <WordmarkLogo {...props} /> : <IfeLogo {...props} />;
}

type VariantProps = Omit<LogoProps, "variant">;

function IfeLogo({ alt = "iFluids Engineering Logo", imageClassName = "h-9 w-auto object-contain", containerClassName = "px-5 py-3" }: VariantProps) {
  return (
    <span className={`inline-flex items-center justify-center ${containerClassName}`}>
      <img src={ifeLogo} alt={alt} className={imageClassName} />
    </span>
  );
}

// Separate component so only the wordmark (theme-dependent) needs the ThemeProvider; the IFE logo is theme-independent.
function WordmarkLogo({ alt = "iFluids Engineering Logo", imageClassName = "h-9 w-auto object-contain", darkImageClassName, containerClassName = "px-5 py-3" }: VariantProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const wrapperClassName = isDark
    ? `inline-flex items-center justify-center ${containerClassName}`
    : `inline-flex items-center justify-center bg-white rounded-2xl border border-slate-200/80 shadow-md ${containerClassName}`;
  return (
    <span className={wrapperClassName}>
      <img src={isDark ? logoDark : logoLight} alt={alt} className={isDark ? (darkImageClassName ?? imageClassName) : imageClassName} />
    </span>
  );
}
