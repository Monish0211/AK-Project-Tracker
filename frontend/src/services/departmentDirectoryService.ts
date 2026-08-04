import { getEmployees } from "./employeeService";
import { DEFAULT_DEPARTMENTS } from "../data/departmentMasterData";

/**
 * Department master list — the Manpower module is the source of truth.
 * Reads live, unique department names off Manpower's own employee records,
 * merged with the Manpower Add/Edit Employee modal's default department set
 * (so the list isn't empty before any employee record has a department
 * filled in) plus any departments created ad-hoc from User Management this
 * session. Deliberately in-memory only (no localStorage) — a future backend
 * would replace this whole file with a real Departments table/endpoint.
 */
let sessionAdditions: string[] = [];

export function getDepartmentOptions(): string[] {
  const fromEmployees = getEmployees()
    .map((e) => e.department)
    .filter((dept): dept is string => !!dept && dept.trim() !== "");

  const merged = new Set([...DEFAULT_DEPARTMENTS, ...fromEmployees, ...sessionAdditions]);
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

/** Adds a new department to the master list if it doesn't already exist (case-insensitively), returning the canonical stored name. */
export function addDepartment(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const existing = getDepartmentOptions().find((dept) => dept.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;

  sessionAdditions = [...sessionAdditions, trimmed];
  window.dispatchEvent(new Event("pmo:data-changed"));
  return trimmed;
}
