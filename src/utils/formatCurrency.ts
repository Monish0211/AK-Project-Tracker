/** Presentation-only helpers — do not affect any underlying calculation. */

export const formatFullINR = (value: number): string => `₹ ${value.toLocaleString("en-IN")}`;

/** Compact Indian-numbering form for axis ticks / bar labels, e.g. 12.5 L, 3.2 Cr. */
export const formatCompactINR = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)} Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)} L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(0)} K`;
  return `₹${value.toLocaleString("en-IN")}`;
};
