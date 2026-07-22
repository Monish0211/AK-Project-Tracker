export const NotificationRoutes = {
  PROJECTS: "/projects",
  PROJECT_VIEW: (id: string) => `/projects/view/${id}`,
  PROJECT_EDIT: (id: string) => `/projects/edit/${id}`,
  
  INVOICES: "/invoices",
  INVOICE_VIEW: (id: string) => `/invoices/view/${id}`,
  
  TIMESHEETS: "/timesheets",
  EXPENSES: "/expenses",
  CUSTOMERS: "/customers",
  MANPOWER: "/manpower",
  REPORTS: "/reports",
  RESOURCES: "/resources",
  SETTINGS: "/settings"
} as const;
