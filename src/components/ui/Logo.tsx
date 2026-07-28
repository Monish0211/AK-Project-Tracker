import logoSrc from "../../assets/logo.png";

interface LogoProps {
  alt?: string;
  className?: string;
}

/**
 * Single source of truth for the iFluids logo asset. Imports the image as a
 * module instead of referencing a hardcoded "/logo.png" path, so Vite always
 * resolves it to the correct URL under whatever base path is active for the
 * current build (plain "/" in dev, "/AK-Project-Tracker/" on the GitHub
 * Pages build) — a hardcoded absolute path 404s under a non-root base.
 */
export function Logo({ alt = "iFluids Engineering Logo", className = "h-9 w-auto object-contain" }: LogoProps) {
  return <img src={logoSrc} alt={alt} className={className} />;
}
