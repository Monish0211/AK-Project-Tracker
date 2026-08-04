/**
 * The canonical Department list for the Manpower module — single source of
 * truth so it's defined once, not duplicated as a separate hardcoded array
 * in every place a Department picker appears (Manpower's Add/Edit Employee
 * modal, User Management's Add/Edit User drawer, etc.).
 */
export const DEFAULT_DEPARTMENTS: string[] = [
  "Process",
  "Mechanical",
  "Civil",
  "Instrumentation",
  "Electrical",
  "Training",
  "Design Engineering Services",
];
