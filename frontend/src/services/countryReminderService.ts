import { apiClient } from "./apiClient";

/**
 * Settings → Country Reminders (the per-country project reminder alerts switch and its change history) and the important reminders of each country. Every call is
 * authorized on the server from the user's current country grants; nothing here decides who may see what (the X-Active-Country header the API client already sends only
 * narrows a list to the selected country). The two Weekly Emails are NOT configured here: they stay global under Settings → Weekly Emails.
 */

export type CountryReminderType = "PROJECT_REMINDERS";

export interface CountryReminderSettingView {
  type: CountryReminderType;
  label: string;
  isDefault: boolean;
  enabled: boolean;
  updatedAt: string | null;
}

export interface CountryReminderCountry {
  regionId: string;
  code: string | null;
  name: string;
  settings: CountryReminderSettingView[];
}

export interface SettingAuditEntry {
  id: string;
  reminderType: string;
  actorName: string;
  previousValue: { enabled: boolean } | null;
  newValue: { enabled: boolean };
  changedAt: string;
}

export interface CountryReminder {
  id: string;
  regionId: string;
  countryCode: string | null;
  country: string;
  title: string;
  description: string | null;
  reminderDate: string;
  reminderTime: string | null;
  priority: "Low" | "Normal" | "High" | "Critical";
  isCompleted: boolean;
  completedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const countryReminderService = {
  listSettings: () => apiClient.get<{ countries: CountryReminderCountry[] }>("/country-reminder-settings"),
  updateSetting: (regionId: string, type: CountryReminderType, body: { enabled: boolean }) =>
    apiClient.put<CountryReminderSettingView>(`/country-reminder-settings/${regionId}/${type}`, body),
  audit: (regionId: string) => apiClient.get<{ items: SettingAuditEntry[] }>(`/country-reminder-settings/${regionId}/audit`),

  listReminders: (opts: { includeCompleted?: boolean; regionId?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.includeCompleted) q.set("includeCompleted", "true");
    if (opts.regionId) q.set("regionId", opts.regionId);
    const qs = q.toString();
    return apiClient.get<{ items: CountryReminder[] }>(`/country-reminders${qs ? `?${qs}` : ""}`);
  },
  createReminder: (body: { regionId: string; title: string; description?: string; reminderDate: string; reminderTime?: string; priority?: CountryReminder["priority"] }) =>
    apiClient.post<CountryReminder>("/country-reminders", body),
  updateReminder: (id: string, body: Partial<Pick<CountryReminder, "title" | "description" | "reminderDate" | "reminderTime" | "priority" | "isCompleted">>) =>
    apiClient.patch<CountryReminder>(`/country-reminders/${id}`, body),
  deleteReminder: (id: string) => apiClient.delete<void>(`/country-reminders/${id}`),
};

/** Important reminders grouped by country, each country on its own (never merged). Order: by country name, then date and time. */
export function groupRemindersByCountry(items: CountryReminder[]): { country: string; regionId: string; items: CountryReminder[] }[] {
  const groups = new Map<string, { country: string; regionId: string; items: CountryReminder[] }>();
  for (const r of items) {
    const g = groups.get(r.regionId) ?? { country: r.country, regionId: r.regionId, items: [] };
    g.items.push(r);
    groups.set(r.regionId, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.country.localeCompare(b.country))
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => `${a.reminderDate} ${a.reminderTime ?? ""}`.localeCompare(`${b.reminderDate} ${b.reminderTime ?? ""}`)) }));
}
