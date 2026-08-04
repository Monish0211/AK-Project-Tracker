import { getEmployees } from "./employeeService";

/**
 * Reporting Manager master list — the Manpower module is the source of
 * truth. Reads live, unique manager names off every employee record's
 * `reportingManager` field, plus any managers added ad-hoc from User
 * Management this session. Deliberately in-memory only (no localStorage) —
 * a future backend would replace this file with a real query against the
 * Manpower/organization-chart table.
 */
let sessionAdditions: string[] = [];

export function getReportingManagerOptions(): string[] {
  const fromEmployees = getEmployees()
    .map((e) => e.reportingManager)
    .filter((manager): manager is string => !!manager && manager.trim() !== "");

  const merged = new Set([...fromEmployees, ...sessionAdditions]);
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

/** Adds a new reporting manager to the master list if it doesn't already exist (case-insensitively), returning the canonical stored name. */
export function addReportingManager(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const existing = getReportingManagerOptions().find((mgr) => mgr.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;

  sessionAdditions = [...sessionAdditions, trimmed];
  window.dispatchEvent(new Event("pmo:data-changed"));
  return trimmed;
}
