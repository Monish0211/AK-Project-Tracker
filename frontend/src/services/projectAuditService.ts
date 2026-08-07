import type { Project } from "../types/Project";
import type { ProjectNote } from "../types/ProjectNote";
import type { InvoiceLine } from "../types/InvoiceItem";
import { getProjectById, updateProject } from "./projectService";
import { notificationService } from "../notifications/notificationService";

export interface LogAuditOptions {
  title: string;
  details: string;
  author?: string;
  notificationTitle?: string;
}

const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const formatCurrencyDisplay = (val: number): string => {
  return `₹ ${(val || 0).toLocaleString("en-IN")}`;
};

/**
 * Base method to append a permanent Audit Note entry to project.notes.
 * Never overwrites or deletes previous notes. Persists to localStorage and triggers
 * live reactive UI updates across all PMO Portal modules.
 */
export function logProjectAudit(projectId: string, options: LogAuditOptions): Project | undefined {
  const project = getProjectById(projectId);
  if (!project) return undefined;

  const timestamp = new Date().toISOString();
  const author = options.author || "Administrator";
  const message = `${options.title}\n\n${options.details.trim()}`;

  const auditNote: ProjectNote = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    projectId,
    message,
    createdBy: author,
    createdAt: timestamp,
  };

  const updatedNotes = [auditNote, ...(project.notes || [])];
  const updatedProject: Project = {
    ...project,
    notes: updatedNotes,
    updatedAt: timestamp,
  };

  updateProject(updatedProject);

  if (options.notificationTitle) {
    try {
      notificationService.dispatchEvent({
        ruleId: `AUDIT_${options.title.toUpperCase().replace(/\s+/g, "_")}_${Date.now()}`,
        version: 1,
        title: options.notificationTitle,
        message: `${options.title}: ${options.details.replace(/\n+/g, " ")}`,
        category: "Information",
        severity: "Info",
        source: "Projects",
        targetAudience: "Everyone",
        deliveryChannels: ["InApp"],
        projectId: project.id,
        projectCode: project.prNo,
        actionLabel: "View Project",
        actionRoute: `/projects/view/${project.id}`,
        timestamp: timestamp,
      });
    } catch (err) {
      console.error("Failed to dispatch audit notification:", err);
    }
  }

  window.dispatchEvent(new Event("pmo:data-changed"));
  return updatedProject;
}

/**
 * Audit Log Helper: When an Invoice is Raised / Created.
 */
export function logInvoiceRaisedAudit(
  projectId: string,
  invoiceNo: string,
  invoiceDate: string,
  totalAmount: number,
  activityCount: number,
  author = "Administrator"
): Project | undefined {
  const details = [
    `Invoice No: ${invoiceNo}`,
    ``,
    `Invoice Date: ${formatDateDisplay(invoiceDate)}`,
    `Invoice Amount: ${formatCurrencyDisplay(totalAmount)}`,
    `Activities Invoiced: ${activityCount} item(s)`,
    ``,
    `Raised By: ${author}`,
  ].join("\n");

  return logProjectAudit(projectId, {
    title: "Invoice Raised",
    details,
    author,
    notificationTitle: `📄 Invoice Raised: ${invoiceNo}`,
  });
}

export interface FieldChange {
  field: string;
  oldVal: string;
  newVal: string;
}

/**
 * Audit Log Helper: When an Invoice is Edited / Updated.
 */
export function logInvoiceUpdatedAudit(
  projectId: string,
  invoiceNo: string,
  changes: FieldChange[],
  author = "Administrator"
): Project | undefined {
  if (changes.length === 0) return undefined;

  const changesList = changes
    .map((c) => `• ${c.field} changed from ${c.oldVal} → ${c.newVal}`)
    .join("\n");

  const details = [
    `Invoice No: ${invoiceNo}`,
    ``,
    `Updated Fields:`,
    changesList,
    ``,
    `Updated By: ${author}`,
  ].join("\n");

  return logProjectAudit(projectId, {
    title: "Invoice Updated",
    details,
    author,
    notificationTitle: `✏️ Invoice Updated: ${invoiceNo}`,
  });
}

/**
 * Helper to compute diff between old invoice line and updated invoice line.
 */
export function diffInvoiceLines(oldLine: InvoiceLine, newLine: InvoiceLine): FieldChange[] {
  const changes: FieldChange[] = [];

  if (oldLine.invoiceDate !== newLine.invoiceDate) {
    changes.push({
      field: "Invoice Date",
      oldVal: formatDateDisplay(oldLine.invoiceDate),
      newVal: formatDateDisplay(newLine.invoiceDate),
    });
  }

  if (oldLine.status !== newLine.status) {
    changes.push({
      field: "Status",
      oldVal: oldLine.status,
      newVal: newLine.status,
    });
  }

  if (oldLine.invoiceAmountINR !== newLine.invoiceAmountINR) {
    changes.push({
      field: "Invoice Amount",
      oldVal: formatCurrencyDisplay(oldLine.invoiceAmountINR),
      newVal: formatCurrencyDisplay(newLine.invoiceAmountINR),
    });
  }

  if (oldLine.quantityBilled !== newLine.quantityBilled) {
    changes.push({
      field: "Quantity Billed",
      oldVal: `${oldLine.quantityBilled}`,
      newVal: `${newLine.quantityBilled}`,
    });
  }

  if ((oldLine.clientReference || "") !== (newLine.clientReference || "")) {
    changes.push({
      field: "Client Reference",
      oldVal: oldLine.clientReference || "None",
      newVal: newLine.clientReference || "None",
    });
  }

  if ((oldLine.remarks || "") !== (newLine.remarks || "")) {
    changes.push({
      field: "Remarks",
      oldVal: oldLine.remarks || "None",
      newVal: newLine.remarks || "None",
    });
  }

  return changes;
}

/**
 * Audit Log Helper: When an Invoice (or Invoice Line) is Deleted.
 */
export function logInvoiceDeletedAudit(
  projectId: string,
  invoiceNo: string,
  previousAmount: number,
  reason = "User deleted invoice from Invoice History",
  author = "Administrator"
): Project | undefined {
  const formattedDate = formatDateDisplay(new Date().toISOString());

  const details = [
    `Invoice No: ${invoiceNo}`,
    ``,
    `Deleted By: ${author}`,
    `Deleted On: ${formattedDate}`,
    `Reason: ${reason}`,
    `Previous Invoice Amount: ${formatCurrencyDisplay(previousAmount)}`,
  ].join("\n");

  return logProjectAudit(projectId, {
    title: "Invoice Deleted",
    details,
    author,
    notificationTitle: `🗑️ Invoice Deleted: ${invoiceNo}`,
  });
}

/**
 * Audit Log Helper: When an entire Invoice Cycle status changes (Draft -> Raised -> Paid -> Cancelled).
 */
export function logInvoiceCycleStatusChangedAudit(
  projectId: string,
  invoiceNo: string,
  oldStatus: string,
  newStatus: string,
  author = "Administrator"
): Project | undefined {
  if (oldStatus === newStatus) return undefined;

  const details = [
    `Invoice No: ${invoiceNo}`,
    ``,
    `Updated Fields:`,
    `• Status changed from ${oldStatus} → ${newStatus}`,
    ``,
    `Updated By: ${author}`,
  ].join("\n");

  return logProjectAudit(projectId, {
    title: "Invoice Updated",
    details,
    author,
    notificationTitle: `🔄 Invoice Status Updated: ${invoiceNo} (${newStatus})`,
  });
}

/**
 * Generic Audit Logger for future event types (Payment Received, Expense Updated, Timesheet Imported, etc.).
 */
export function logGenericActivityAudit(
  projectId: string,
  title: string,
  details: string,
  author = "Administrator",
  notificationTitle?: string
): Project | undefined {
  return logProjectAudit(projectId, {
    title,
    details,
    author,
    notificationTitle,
  });
}
