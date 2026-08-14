import type { Project } from "../types/Project";

// =============================================================================
// PHASE 3.5 — BACKEND-CONNECTED EXPENSE BUDGET
// =============================================================================
// Expense Budget is NOT an independent resource — it is 5 flat fields living
// directly on the Project row (see Backend's ProjectGeneralInfoData /
// ProjectDto). There is no dedicated table, no dedicated endpoint, and no
// separate load/sync step: projectService.ts's toGeneralInfoPayload() and
// mergeBackendGeneralInfoIntoLocalProject() already carry these 5 fields
// through the exact same POST/PATCH/GET /projects calls General Information
// itself uses (createProjectGeneralInfo / updateProjectGeneralInfo /
// fetchProjectByIdFromApi), so Expense Budget persists to PostgreSQL for
// free the moment those already-existing calls run — no code here needs to
// call the backend a second time.
//
// This file exists anyway (per the Phase 3.5 spec, matching
// quantityService.ts / otherProjectExpenseService.ts's naming convention)
// to be Expense Budget's own home for the pure, project-scoped helpers
// ExpenseBudgetCard.tsx and its validator need — kept completely separate
// from otherProjectExpenseService.ts's CRUD, since these are two independent
// modules per the Phase 3.5 design.

export interface ExpenseBudgetFields {
  manhourBudgetAmount: number;
  manhourBudgetHours: number;
  manhourBudgetRemarks: string;
  nonManhourBudgetAmount: number;
  nonManhourBudgetRemarks: string;
}

/** Reads the 5 Expense Budget fields off a Project, defaulting every missing value the same way ExpenseBudgetCard.tsx already does (`|| 0` / `|| ""`). */
export function getExpenseBudgetFields(project: Project): ExpenseBudgetFields {
  return {
    manhourBudgetAmount: project.manhourBudgetAmount || 0,
    manhourBudgetHours: project.manhourBudgetHours || 0,
    manhourBudgetRemarks: project.manhourBudgetRemarks || "",
    nonManhourBudgetAmount: project.nonManhourBudgetAmount || 0,
    nonManhourBudgetRemarks: project.nonManhourBudgetRemarks || "",
  };
}

/** Total Project Cost = Man-Hour Budget + Non Man-Hour Budget — same formula ExpenseBudgetCard.tsx already computes inline, exposed here so the validator (and any future caller) never has to re-derive it. */
export function getTotalBudgetedCost(project: Project): number {
  const fields = getExpenseBudgetFields(project);
  return fields.manhourBudgetAmount + fields.nonManhourBudgetAmount;
}
