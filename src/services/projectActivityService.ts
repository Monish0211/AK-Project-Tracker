import type { Project } from "../types/Project";
import { getInvoices } from "./invoiceService";

export type ProjectActivityCategory = "Project" | "Invoice" | "Payment" | "Notes" | "Team" | "Milestone";

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
 * resource start dates) plus the standalone invoice records that reference
 * this project's PR No. No synthetic/mock events — an event only appears if
 * a real timestamp already exists for it.
 */
export const getProjectActivityTimeline = (project: Project, limit = 20): ProjectActivityEvent[] => {
  const events: ProjectActivityEvent[] = [];

  if (project.createdAt) {
    events.push({
      id: `${project.id}-created`,
      category: "Project",
      title: "Project Created",
      description: `${project.projectTitle || project.prNo} was added to the repository.`,
      user: project.primaryProjectManager || undefined,
      timestamp: project.createdAt,
    });
  }

  if (project.updatedAt && project.updatedAt !== project.createdAt) {
    events.push({
      id: `${project.id}-updated`,
      category: "Project",
      title: "Project Updated",
      description: `${project.projectTitle || project.prNo} details were updated.`,
      user: project.primaryProjectManager || undefined,
      timestamp: project.updatedAt,
    });
  }

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

  (project.milestoneBillings || []).forEach((billing) => {
    events.push({
      id: `milestone-${billing.id}`,
      category: "Milestone",
      title: "Milestone Billed",
      description: `${billing.milestoneName} billed for ₹ ${billing.amount.toLocaleString("en-IN")}.`,
      timestamp: billing.invoiceDate,
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

  getInvoices()
    .filter((invoice) => invoice.prNo === project.prNo)
    .forEach((invoice) => {
      events.push({
        id: `invoice-${invoice.id}`,
        category: "Invoice",
        title: "Invoice Raised",
        description: `${invoice.invoiceRef} raised for ₹ ${invoice.invoiceAmount.toLocaleString("en-IN")}.`,
        timestamp: invoice.createdAt,
      });

      if (invoice.receivedAmount > 0) {
        events.push({
          id: `payment-${invoice.id}`,
          category: "Payment",
          title: "Payment Received",
          description: `₹ ${invoice.receivedAmount.toLocaleString("en-IN")} received against ${invoice.invoiceRef}.`,
          timestamp: invoice.updatedAt || invoice.createdAt,
        });
      }
    });

  return events
    .filter((event) => !!event.timestamp && !Number.isNaN(new Date(event.timestamp).getTime()))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
};
