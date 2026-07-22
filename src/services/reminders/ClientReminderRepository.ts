import type { ProjectReminder } from "../../types/ProjectReminder";
import type { ReminderRepository } from "./ReminderRepository";

const STORAGE_KEY = "pmo_reminders";

export class ClientReminderRepository implements ReminderRepository {
  getAll(): ProjectReminder[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data) as ProjectReminder[];
    } catch (e) {
      console.error("Failed to load reminders from local repository", e);
      return [];
    }
  }

  saveAll(reminders: ProjectReminder[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
    } catch (e) {
      console.error("Failed to save reminders to local repository", e);
    }
  }
}
