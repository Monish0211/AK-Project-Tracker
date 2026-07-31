import type { ProjectReminder } from "../../types/ProjectReminder";

export interface ReminderRepository {
  getAll(): ProjectReminder[];
  saveAll(reminders: ProjectReminder[]): void;
}
