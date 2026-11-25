/**
 * The UAE free-zone region is STORED as "FZI" (PR Category, region name, user country grants, PR prefix "PRI-") and SHOWN as "FZE" everywhere
 * (Nov 2026). Display only: no saved value changes. Use prCategoryLabel() wherever a category or region name is put on screen or into an export,
 * and prCategoryFromText() wherever a user types or imports one.
 */
const DISPLAY: Readonly<Record<string, string>> = { FZI: "FZE" };

export function prCategoryLabel(value: string): string;
export function prCategoryLabel(value: string | null | undefined): string | null | undefined;
export function prCategoryLabel(value: string | null | undefined): string | null | undefined {
  return value ? DISPLAY[value] ?? value : value;
}

/** "FZE" (any letter case) typed by a user or read from a file means the stored "FZI"; anything else is returned as it is. */
export function prCategoryFromText(text: string): string {
  const stored = Object.entries(DISPLAY).find(([, shown]) => shown.toLowerCase() === text.trim().toLowerCase());
  return stored ? stored[0] : text;
}
