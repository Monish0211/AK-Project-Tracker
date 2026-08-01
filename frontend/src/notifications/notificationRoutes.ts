export const NotificationRoutes = {
  PROJECTS: "/projects",
  PROJECT_VIEW: (id: string) => `/projects/view/${id}`,
  PROJECT_EDIT: (id: string) => `/projects/edit/${id}`,

  TIMESHEETS: "/timesheets",
  CUSTOMERS: "/customers",
  MANPOWER: "/manpower",
  REPORTS: "/reports",
  SETTINGS: "/settings"
} as const;
