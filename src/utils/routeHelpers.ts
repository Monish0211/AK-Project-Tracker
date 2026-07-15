import { matchPath } from "react-router-dom";

const ROUTE_TITLE_MAP = [
  { path: "/projects/add", title: "Add Project" },
  { path: "/projects/edit/:id", title: "Edit Project" },
  { path: "/projects/view/:id", title: "View Project" },
  { path: "/projects", title: "Projects" },
  { path: "/customers", title: "Customer Master" },
  { path: "/invoices/add", title: "Add Invoice" },
  { path: "/invoices/edit/:id", title: "Edit Invoice" },
  { path: "/invoices/view/:id", title: "View Invoice" },
  { path: "/invoices", title: "Invoices" },
  { path: "/manpower", title: "Manpower" },
  { path: "/timesheets", title: "Timesheets" },
  { path: "/expenses", title: "Expenses" },
  { path: "/reports", title: "Reports" },
  { path: "/resources", title: "Resources" },
  { path: "/settings", title: "Settings" },
  { path: "/dashboard", title: "Dashboard" },
  { path: "/", title: "Dashboard" },
];

export const getPageTitle = (pathname: string): string => {
  for (const entry of ROUTE_TITLE_MAP) {
    if (matchPath(entry.path, pathname)) {
      return entry.title;
    }
  }
  return "PMO Portal";
};
