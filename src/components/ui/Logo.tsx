import logoLight from "../../assets/logo-light.jpg";
import logoDark from "../../assets/logo-dark.png";
import { useTheme } from "../../context/ThemeContext";

interface LogoProps {
  alt?: string;
  imageClassName?: string;
  /** Overrides imageClassName for Dark Mode. Falls back to imageClassName if omitted. */
  darkImageClassName?: string;
  containerClassName?: string;
}

/**
 * Single source of truth for the iFluids logo. Imports both theme variants
 * as modules instead of referencing hardcoded "/logo-*.{jpg,png}" paths, so
 * Vite always resolves them to the correct URL under whatever base path is
 * active for the current build (plain "/" in dev, "/AK-Project-Tracker/" on
 * the GitHub Pages build) — a hardcoded absolute path 404s under a
 * non-root base.
 *
 * Renders the official light-theme asset in Light Mode and the official
 * dark-theme asset in Dark Mode — the artwork itself is never recolored or
 * filtered, just swapped for the matching official file.
 *
 * The two assets are NOT interchangeable drop-ins: logo-light.jpg is a
 * plain wordmark, but logo-dark.png is a fully self-contained tile that
 * already bakes in its own dark card frame + white inner panel around the
 * mark (confirmed by sampling its corner pixel — dark navy, not white/
 * transparent). Wrapping that tile in our own light card would just add a
 * third, redundant, invisible layer of chrome behind an already-opaque
 * image, and a large share of its own canvas is its own frame rather than
 * the mark — so at the same declared height it reads as smaller than the
 * light asset. To compensate: the card chrome (surface/border/shadow) is
 * only applied in Light Mode, and `darkImageClassName` lets each usage
 * render the Dark Mode asset at a taller height to offset its internal
 * framing. `containerClassName` (padding/margin) still applies in both
 * modes so surrounding layout spacing stays consistent either way.
 */
export function Logo({
  alt = "iFluids Engineering Logo",
  imageClassName = "h-9 w-auto object-contain",
  darkImageClassName,
  containerClassName = "px-5 py-3",
}: LogoProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const logoSrc = isDark ? logoDark : logoLight;

  const wrapperClassName = isDark
    ? `inline-flex items-center justify-center ${containerClassName}`
    : `inline-flex items-center justify-center bg-white rounded-2xl border border-slate-200/80 shadow-md ${containerClassName}`;

  return (
    <span className={wrapperClassName}>
      <img src={logoSrc} alt={alt} className={isDark ? (darkImageClassName ?? imageClassName) : imageClassName} />
    </span>
  );
}
