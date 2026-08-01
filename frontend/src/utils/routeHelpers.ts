import { matchPath } from "react-router-dom";

const ROUTE_TITLE_MAP = [
  { path: "/projects/add", title: "Add Project" },
  { path: "/projects/edit/:id", title: "Edit Project" },
  { path: "/projects/view/:id", title: "View Project" },
  { path: "/projects", title: "Projects" },
  { path: "/customers", title: "Customer Master" },
  { path: "/manpower", title: "Manpower" },
  { path: "/timesheets", title: "Timesheets" },
  { path: "/reports", title: "Reports" },
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
