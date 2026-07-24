import React from "react";

/**
 * Prototype Flag: Master toggle to enable/disable Glass Reflection sweep across all page banners.
 */
export const ENABLE_GLASS_REFLECTION = true;

interface Props {
  enabled?: boolean;
  className?: string;
}

/**
 * GlassReflectionOverlay
 *
 * Adds a soft, diagonal (25°) semi-transparent glass reflection sweep across any hero or header banner surface.
 * 100% GPU compositor accelerated with zero layout shift or readability impact.
 */
export const GlassReflectionOverlay: React.FC<Props> = ({
  enabled = ENABLE_GLASS_REFLECTION,
  className = "",
}) => {
  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className={`pmo-glass-reflection-sweep pointer-events-none ${className}`}
    />
  );
};
