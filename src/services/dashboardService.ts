import { getProjects } from "./projectService";
import { getGrossProfit, getTotalProjectCost } from "./expenseService";
import { getProjectCommercialSummary } from "./invoiceProgressService";
import { getInvoices } from "./invoiceService";

export interface DashboardMetrics {
  totalProjects: number;
  totalWOValue: number;
  totalInvoiceRaised: number;
  totalPaymentReceived: number;
  totalOutstanding: number;
  totalExpenses: number;
  totalProfit: number;
  totalProfitPercentage: number;
}

/* ===================================================
   KPI METRICS
=================================================== */

export const getDashboardMetrics = (): DashboardMetrics => {
  const projects = getProjects();

  const totalProjects = projects.length;

  const totalWOValue = projects.reduce(
    (sum, project) => sum + (project.workOrderValueINR || 0),
    0
  );

  let totalInvoiceRaised = 0;
  let totalOutstanding = 0;

  projects.forEach((project) => {
    const summary = getProjectCommercialSummary(project);
    totalInvoiceRaised += summary.totalInvoiceRaised;
    totalOutstanding += summary.outstandingCollection;
  });

  // Payment Received is tracked separately in the standalone Invoices module
  // (project.invoiceItems / Invoice History has no payment-collection data).
  const totalPaymentReceived = getInvoices()
    .filter((invoice) => invoice.status !== "Cancelled")
    .reduce((sum, invoice) => sum + (invoice.receivedAmount || 0), 0);

  const totalExpenses = projects.reduce(
    (sum, project) =>
      sum +
      getTotalProjectCost(
        project.manhourExpenses,
        project.nonManhourExpenses
      ),
    0
  );

  const totalProfit = projects.reduce(
    (sum, project) =>
      sum +
      getGrossProfit(
        project.workOrderValueINR || 0,
        getTotalProjectCost(
          project.manhourExpenses,
          project.nonManhourExpenses
        )
      ),
    0
  );

  const totalProfitPercentage =
    totalWOValue === 0
      ? 0
      : (totalProfit / totalWOValue) * 100;

  return {
    totalProjects,
    totalWOValue,
    totalInvoiceRaised,
    totalPaymentReceived,
    totalOutstanding,
    totalExpenses,
    totalProfit,
    totalProfitPercentage,
  };
};

/* ===================================================
   PROJECT STATUS
=================================================== */

export const getProjectStatusData = () => {
  const projects = getProjects();

  // Always General Information → Project Status. Never derived from Invoice
  // History / commercial calculations.
  const status = {
    Active: 0,
    "On Hold": 0,
    Completed: 0,
    Cancelled: 0,
  };

  projects.forEach((project) => {
    if (project.projectStatus === "Active") {
      status.Active++;
    } else if (project.projectStatus === "On Hold") {
      status["On Hold"]++;
    } else if (project.projectStatus === "Completed") {
      status.Completed++;
    } else if (project.projectStatus === "Cancelled") {
      status.Cancelled++;
    }
  });

  return [
    {
      name: "Active",
      value: status.Active,
    },
    {
      name: "On Hold",
      value: status["On Hold"],
    },
    {
      name: "Completed",
      value: status.Completed,
    },
    {
      name: "Cancelled",
      value: status.Cancelled,
    },
  ];
};

/* ===================================================
   DEPARTMENT SUMMARY
=================================================== */

export const getDepartmentSummary = () => {
  const projects = getProjects();

  const departments: Record<string, number> = {};

  projects.forEach((project) => {
    const department =
      project.department?.trim() || "Unassigned";

    departments[department] =
      (departments[department] || 0) + 1;
  });

  return Object.entries(departments)
    .map(([department, count]) => ({
      department,
      count,
    }))
    .sort((a, b) => b.count - a.count);
};

/* ===================================================
   TOP CLIENTS
=================================================== */

/* ===================================================
   TOP CLIENTS
=================================================== */

export const getTopClients = () => {
  const projects = getProjects();

  const clients: Record<string, number> = {};

  projects.forEach((project) => {
    const client =
      project.client?.trim() || "Unknown";

    clients[client] =
      (clients[client] || 0) +
      (project.workOrderValueINR || 0);
  });

  return Object.entries(clients)
    .map(([client, workOrderValue]) => ({
      client,
      workOrderValue,
    }))
    .sort(
      (a, b) =>
        b.workOrderValue - a.workOrderValue
    )
    .slice(0, 5);
};

/* ===================================================
   RECENT PROJECTS
=================================================== */

export const getRecentProjects = () => {
  return getProjects()
    .sort(
      (a, b) =>
        new Date(b.createdAt ?? "").getTime() -
        new Date(a.createdAt ?? "").getTime()
    )
    .slice(0, 5);
};

/* ===================================================
   PROJECT HEALTH SUMMARY
   Schedule-health lens derived from General Information dates and pending
   quantity/invoice progress — independent of (and additional to) the
   Active/On Hold/Completed/Cancelled Project Status field above.
=================================================== */

export interface ProjectHealthSummary {
  onTrack: number;
  atRisk: number;
  delayed: number;
  notStarted: number;
  total: number;
}

const AT_RISK_WINDOW_DAYS = 14;

export const getProjectHealthSummary = (): ProjectHealthSummary => {
  // Completed/Cancelled projects are out of scope for an in-progress
  // schedule-health rollup.
  const projects = getProjects().filter(
    (project) =>
      project.projectStatus !== "Completed" &&
      project.projectStatus !== "Cancelled"
  );

  const today = new Date();

  let onTrack = 0;
  let atRisk = 0;
  let delayed = 0;
  let notStarted = 0;

  projects.forEach((project) => {
    const start = project.projectStartDate ? new Date(project.projectStartDate) : null;
    const end = project.projectEndDate ? new Date(project.projectEndDate) : null;
    const hasPendingWork =
      (project.totalPendingQty || 0) > 0 || (project.pendingInvoicePercentage || 0) > 0;

    if (start && !Number.isNaN(start.getTime()) && start.getTime() > today.getTime()) {
      notStarted++;
      return;
    }

    if (end && !Number.isNaN(end.getTime())) {
      const daysToEnd = (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

      if (daysToEnd < 0) {
        delayed++;
        return;
      }

      if (daysToEnd <= AT_RISK_WINDOW_DAYS && hasPendingWork) {
        atRisk++;
        return;
      }
    }

    onTrack++;
  });

  return { onTrack, atRisk, delayed, notStarted, total: projects.length };
};

/* ===================================================
   RECENT ACTIVITY
   Derived from real, already-timestamped records (project audit fields,
   project notes, standalone invoice records) — no synthetic/mock events.
=================================================== */

export interface ActivityEvent {
  id: string;
  category: "Project" | "Invoice" | "Payment" | "Notes";
  title: string;
  description: string;
  projectRef: string;
  timestamp: string;
}

export const getRecentActivity = (limit = 8): ActivityEvent[] => {
  const projects = getProjects();
  const invoices = getInvoices();
  const events: ActivityEvent[] = [];

  projects.forEach((project) => {
    if (project.createdAt) {
      events.push({
        id: `${project.id}-created`,
        category: "Project",
        title: "Project Created",
        description: `${project.projectTitle || project.prNo} added for ${project.client || "client"}.`,
        projectRef: project.prNo,
        timestamp: project.createdAt,
      });
    }

    if (project.updatedAt && project.updatedAt !== project.createdAt) {
      events.push({
        id: `${project.id}-updated`,
        category: "Project",
        title: "Project Updated",
        description: `${project.projectTitle || project.prNo} details were updated.`,
        projectRef: project.prNo,
        timestamp: project.updatedAt,
      });
    }

    (project.notes || []).forEach((note) => {
      events.push({
        id: `note-${note.id}`,
        category: "Notes",
        title: "Project Note Added",
        description: note.message,
        projectRef: project.prNo,
        timestamp: note.createdAt,
      });
    });
  });

  invoices.forEach((invoice) => {
    events.push({
      id: `invoice-${invoice.id}`,
      category: "Invoice",
      title: "Invoice Raised",
      description: `${invoice.invoiceRef} raised for ${invoice.client}.`,
      projectRef: invoice.prNo,
      timestamp: invoice.createdAt,
    });

    if (invoice.receivedAmount > 0) {
      events.push({
        id: `payment-${invoice.id}`,
        category: "Payment",
        title: "Payment Received",
        description: `${invoice.client} paid ₹ ${invoice.receivedAmount.toLocaleString("en-IN")} against ${invoice.invoiceRef}.`,
        projectRef: invoice.prNo,
        timestamp: invoice.updatedAt || invoice.createdAt,
      });
    }
  });

  return events
    .filter((event) => !!event.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
};