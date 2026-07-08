import { getProjects } from "./projectService";
import { getGrossProfit, getTotalProjectCost } from "./expenseService";

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
    (sum, project) => sum + project.workOrderValue,
    0
  );

  const totalInvoiceRaised = projects.reduce(
    (sum, project) => sum + project.invoiceRaised,
    0
  );

  const totalPaymentReceived = projects.reduce(
    (sum, project) => sum + project.paymentReceived,
    0
  );

  const totalOutstanding = projects.reduce(
    (sum, project) => sum + project.outstanding,
    0
  );

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
        project.workOrderValue,
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

  const status = {
    Active: 0,
    Completed: 0,
    "On Hold": 0,
    Cancelled: 0,
  };

  projects.forEach((project) => {
    switch (project.projectStatus) {
      case "Active":
        status.Active++;
        break;

      case "Completed":
        status.Completed++;
        break;

      case "On Hold":
        status["On Hold"]++;
        break;

      case "Cancelled":
        status.Cancelled++;
        break;
    }
  });

  return [
    {
      name: "Active",
      value: status.Active,
    },
    {
      name: "Completed",
      value: status.Completed,
    },
    {
      name: "On Hold",
      value: status["On Hold"],
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
      project.workOrderValue;
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