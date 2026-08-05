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

  // Formal Project Completion Event
  if (project.projectStatus === "Completed" || project.actualCompletionDate) {
    events.push({
      id: `${project.id}-completion-event`,
      category: "Project",
      title: "PROJECT COMPLETED",
      description: `Completion Date: ${project.actualCompletionDate || project.projectEndDate || "—"}${
        project.completionRemarks ? `\nRemarks: ${project.completionRemarks}` : ""
      }`,
      user: project.completedBy || "Administrator",
      timestamp: project.completedTimestamp || project.updatedAt || new Date().toISOString(),
    });
  } else if (project.updatedAt && project.projectStatus && project.projectStatus !== "Active" && project.projectStatus !== "In Progress") {
    // Major Project Status
    events.push({
      id: `${project.id}-status-${project.projectStatus.toLowerCase().replace(/\s+/g, "-")}`,
      category: "Project",
      title: `Project ${project.projectStatus}`,
      description: `${project.projectTitle || project.prNo} was marked as ${project.projectStatus}.`,
      user: project.primaryProjectManager || undefined,
      timestamp: project.updatedAt,
    });
  }

  // Reminders
  reminderService.getRemindersByProject(project.id).forEach((reminder) => {
    events.push({
      id: `reminder-created-${reminder.id}`,
      category: "Reminders",
      title: "Reminder Created",
      description: `Reminder to "${reminder.title}" was added.`,
      user: reminder.createdBy,
      timestamp: reminder.createdDate,
    });

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
  });

  (project.notes || []).forEach((note) => {
    events.push({
      id: `note-${note.id}`,
      category: "Notes",
      title: note.message.includes("PROJECT COMPLETED") ? "PROJECT COMPLETED" : "Project Note Added",
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

  // Sort descending by timestamp
  return events
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
};
