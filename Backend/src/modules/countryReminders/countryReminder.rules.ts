/**
 * Country-wise reminders: the pure rules (no database).
 *
 * Scope: Project Workspace reminders follow their project's stored country, and important reminders name their country explicitly. The two Weekly Emails (projects missing
 * Other Project Expenses, invoices unpaid for 30+ days) are NOT country-wise: they stay one global, all-countries report each, with their existing schedule and recipients.
 */

/** The per-country settings. Only the project reminder alerts switch is country-wise; there is deliberately no weekly-email type here. */
export const REMINDER_TYPES = ["PROJECT_REMINDERS"] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_TYPE_LABEL: Record<ReminderType, string> = {
  PROJECT_REMINDERS: "Project reminder alerts",
};

export interface SettingValue {
  enabled: boolean;
}

/** What a country has before an administrator saves anything: project reminder alerts ON, exactly as they have always been. */
export function defaultSetting(_type: ReminderType): SettingValue {
  return { enabled: true };
}

export function isReminderType(value: string): value is ReminderType {
  return (REMINDER_TYPES as readonly string[]).includes(value);
}
