import type { Project } from "../types/Project";
import { reminderService } from "./reminders/ReminderService";

export type ProjectActivityCategory = "Project" | "Invoice" | "Payment" | "Notes" | "Team" | "Milestone" | "Reminders";

export interface ProjectActivityEvent {
  id: string;
  category: ProjectActivityCategory;
  title: string;
  description: string;
  user?: string;
  timestamp: string;
}

/**
 * Derives a chronological activity timeline for a single project from its own
 * already-timestamped records (audit fields, notes, milestone billings,
 * resource start dates). No synthetic/mock events — an event only appears if
 * a real timestamp already exists for it.
 */
export const getProjectActivityTimeline = (project: Project, limit = 20): ProjectActivityEvent[] => {
  const events: ProjectActivityEvent[] = [];

  // Project Created and Project Updated are intentionally filtered out
  // to reduce timeline clutter and only show meaningful business activities.

  // Major Project Status
  if (project.updatedAt && project.projectStatus && project.projectStatus !== "Active" && project.projectStatus !== "In Progress") {
    events.push({
      id: `${project.id}-status-${project.projectStatus.toLowerCase().replace(/\s+/g, '-')}`,
      category: "Project",
      title: `Project ${project.projectStatus}`,
      description: `${project.projectTitle || project.prNo} was marked as ${project.projectStatus}.`,
      user: project.primaryProjectManager || undefined,
      timestamp: project.updatedAt,
    });
  }

  // Reminders
  reminderService.getRemindersByProject(project.id).forEach((reminder) => {
    // 1. Reminder Created
    events.push({
      id: `reminder-created-${reminder.id}`,
      category: "Reminders",
      title: "Reminder Created",
      description: `Reminder to "${reminder.title}" was added.`,
      user: reminder.createdBy,
      timestamp: reminder.createdDate,
    });

    // 2. Reminder Completed
    if (reminder.isCompleted && reminder.completedDate) {
      events.push({
        id: `reminder-completed-${reminder.id}`,
        category: "Reminders",
        title: "Reminder Completed",
        description: `Reminder "${reminder.title}" was completed.`,
        user: reminder.createdBy,
        timestamp: reminder.completedDate,
      });
    }
    
    // Additional reminder events (like Snoozed/Updated) could be added here if the model tracks those timestamps in the future.
  });

  (project.notes || []).forEach((note) => {
    events.push({
      id: `note-${note.id}`,
      category: "Notes",
      title: "Project Note Added",
      description: note.message,
      user: note.createdBy || undefined,
      timestamp: note.createdAt,
    });
  });

  (project.invoiceItems || []).forEach((item) => {
    (item.invoices || []).forEach((line) => {
      if (line.status === "Cancelled") return;
      events.push({
        id: `invoice-line-${line.id}`,
        category: "Milestone",
        title: "Invoice Raised",
        description: line.milestoneName
          ? `${item.description} — ${line.milestoneName} billed for ₹ ${line.invoiceAmountINR.toLocaleString("en-IN")}.`
          : `${item.description} billed for ₹ ${line.invoiceAmountINR.toLocaleString("en-IN")}.`,
        user: line.createdBy || undefined,
        timestamp: line.invoiceDate,
      });
    });
  });

  (project.resources || []).forEach((resource) => {
    if (!resource.startDate) return;
    events.push({
      id: `team-${resource.id}`,
      category: "Team",
      title: "Team Member Assigned",
      description: `${resource.employeeName} assigned as ${resource.designation || "team member"}.`,
      user: resource.employeeName,
      timestamp: resource.startDate,
    });
  });

  return events
    .filter((event) => !!event.timestamp && !Number.isNaN(new Date(event.timestamp).getTime()))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
};
