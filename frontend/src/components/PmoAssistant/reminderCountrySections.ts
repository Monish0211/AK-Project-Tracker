/**
 * Splits the Assistant's active Project Workspace reminders into one section per project country, so a user who can see more than one country never gets them merged
 * into one list. The country is the project's stored country, as returned by the reminders API (never inferred from a PR number, creator or client); which reminders
 * arrive at all is decided by the server from the user's country grants and selected country.
 *
 * Order inside a section is kept exactly as given (the caller sorts by due time). Sections are ordered by country name; a reminder whose project has no country
 * (only possible while country access is not enforced) goes in a final "No country" section.
 */
export interface CountrySection<T> {
  key: string;
  country: string;
  rows: T[];
}

export const NO_COUNTRY_LABEL = "No country";

export function sectionRemindersByCountry<T extends { reminder: { regionId?: string | null; country?: string | null } }>(rows: T[]): CountrySection<T>[] {
  const sections = new Map<string, CountrySection<T>>();
  for (const row of rows) {
    const key = row.reminder.regionId ?? "";
    const section = sections.get(key) ?? { key: key || "none", country: (key && row.reminder.country) || NO_COUNTRY_LABEL, rows: [] };
    section.rows.push(row);
    sections.set(key, section);
  }
  return [...sections.values()].sort((a, b) => {
    if (a.country === NO_COUNTRY_LABEL) return 1;
    if (b.country === NO_COUNTRY_LABEL) return -1;
    return a.country.localeCompare(b.country);
  });
}
