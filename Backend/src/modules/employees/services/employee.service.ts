import { AppError } from "../../../shared/utils/AppError.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { processRunSafely, recordRateChangeRun } from "../../manhourCosting/manhourCostRefresh.service.js";
import { hourlyRateChanged } from "../../manhourCosting/manhourCosting.rules.js";
import { countResourcesForEmployee } from "../../resources/services/resource.service.js";
import type { EmployeeDto, ImportEmployeesResultDto, PaginatedEmployeeListDto } from "../dto/employee.dto.js";
import type { EmployeeData } from "../employee.types.js";
import {
  createEmployee as createEmployeeInRepository,
  deleteEmployee as deleteEmployeeInRepository,
  findEmployeeByEmployeeNo,
  findEmployeeById,
  findEmployeesByEmployeeNos,
  findEmployeesPage,
  runEmployeeTransaction,
  updateEmployee as updateEmployeeInRepository,
} from "../repository/employee.repository.js";
import type {
  CreateEmployeeInput,
  ImportEmployeeRowInput,
  ImportEmployeesInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from "../validators/employee.validators.js";

function toEmployeeDto(employee: Awaited<ReturnType<typeof findEmployeeById>>): EmployeeDto {
  if (!employee) {
    throw new AppError("Employee not found.", 404);
  }

  return {
    id: employee.id,
    employeeNo: employee.employeeNo,
    employeeName: employee.employeeName,
    department: employee.department,
    designation: employee.designation,
    reportingManager: employee.reportingManager,
    grade: employee.grade,
    location: employee.location,
    manhourExpenses: employee.manhourExpenses,
    status: employee.status,
    dateOfJoining: employee.dateOfJoining,
    employeeType: employee.employeeType,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

/** Employee Number identifies an employee the same way PR Number identifies a Project — see project.service.ts's assertPrNoAvailable. Employee has no soft-delete, so every employee is "active" for this check, unlike Project's isDeleted-scoped version. */
async function assertEmployeeNoAvailable(employeeNo: string, excludingEmployeeId?: string): Promise<void> {
  const existing = await findEmployeeByEmployeeNo(employeeNo);
  if (existing && existing.id !== excludingEmployeeId) {
    throw new AppError(`An employee with Employee Number "${employeeNo}" already exists.`, 409);
  }
}

function toEmployeeData(input: CreateEmployeeInput | ImportEmployeeRowInput): EmployeeData {
  return {
    employeeNo: input.employeeNo,
    employeeName: input.employeeName,
    department: input.department,
    designation: input.designation,
    reportingManager: input.reportingManager ?? null,
    grade: input.grade,
    location: input.location,
    manhourExpenses: input.manhourExpenses ?? 0, // an import row with a blank rate never reaches here with undefined for an UPDATE (the service strips it); a new employee gets the default 0
    status: input.status,
    dateOfJoining: "dateOfJoining" in input ? input.dateOfJoining ?? null : null,
    employeeType: "employeeType" in input ? input.employeeType ?? null : null,
  };
}

export async function createEmployee(input: CreateEmployeeInput, actor?: AccessTokenPayload): Promise<EmployeeDto> {
  await assertEmployeeNoAvailable(input.employeeNo);

  // Phase 4 / Option A: a new employee normally has no project assignments, so nothing is recalculated. Only if rows were already recorded under this
  // employee number (assigned before the employee record existed, so priced at 0) are they recalculated with the saved rate.
  const { created, run } = await runEmployeeTransaction(async (tx) => {
    const row = await createEmployeeInRepository(toEmployeeData(input), tx);
    const queued = await recordRateChangeRun(tx, { employeeNo: row.employeeNo, previousRate: null, newRate: row.manhourExpenses, source: "EMPLOYEE_CREATE", actor: actor ?? null });
    return { created: row, run: queued };
  });
  const costingRefresh = run ? await processRunSafely(run.runId) : null;
  return { ...toEmployeeDto(created), ...(costingRefresh ? { costingRefresh } : {}) };
}

/**
 * Excel import — mirrors the existing frontend importEmployeesFromExcel()'s
 * exact semantics: each row is added or updated independently (matched by
 * employeeNo), never rejecting the whole batch the way Projects' bulk
 * import does. A row missing employeeNo/employeeName was already filtered
 * out client-side (see importEmployeeRowSchema's comment) before reaching
 * here, so every row that arrives is attempted.
 *
 * P1-10 (production hardening) — the READ side of the old N+1 (one
 * `findEmployeeByEmployeeNo` SELECT per row, before ever touching the row's
 * own create/update) is replaced with exactly ONE bulk SELECT for every
 * employeeNo in this batch, seeding an in-memory existence map. The loop
 * below still processes rows one at a time and keeps that map updated as it
 * goes (`knownIds.set(...)` after every create/update) — so behavior is
 * byte-identical to before for every case that matters, including the
 * pre-existing "two rows in the same file share an employeeNo" case: the
 * FIRST occurrence still creates and the SECOND still updates the
 * just-created row (last-row-in-file wins), because the map reflects this
 * run's own writes immediately, not a stale snapshot. The WRITE side is
 * deliberately left as individual per-row create/update calls, each with
 * its own try/catch (not merged into a shared Prisma transaction): Postgres
 * aborts every statement after the first error within one transaction, so
 * wrapping these in a shared transaction would silently fail every
 * subsequent — otherwise valid — row once any single row fails, which is
 * the opposite of the required "row-level error reporting, one bad row
 * doesn't kill the batch" behavior.
 */
export async function bulkImportEmployees(input: ImportEmployeesInput, actor?: AccessTokenPayload): Promise<ImportEmployeesResultDto> {
  let added = 0;
  let updated = 0;
  let invalid = 0;
  // Phase 4 / Option A: each row whose import really changes an existing employee's hourly rate records a recalculation run in the SAME transaction as that
  // row's save; the runs are processed after the loop. An unchanged rate (and a new employee with no assignments) records nothing.
  const runIds: string[] = [];
  // Phase 4 / Option A safeguard: rows with a blank or unreadable rate (see importEmployeeRowSchema). Reported in the result, never silently turned into 0.
  const ratesSkipped: NonNullable<ImportEmployeesResultDto["ratesSkipped"]> = [];
  const skipReason = (row: ImportEmployeeRowInput) => (row.rateIssue === "UNREADABLE" ? ("UNREADABLE" as const) : ("NOT_PROVIDED" as const));

  const employeeNos = [...new Set(input.employees.map((row) => row.employeeNo))];
  const existingEmployees = await findEmployeesByEmployeeNos(employeeNos);
  const known = new Map(existingEmployees.map((e) => [e.employeeNo, { id: e.id, rate: e.manhourExpenses }] as const));

  for (const row of input.employees) {
    try {
      const existing = known.get(row.employeeNo);
      if (existing) {
        // A blank / unreadable rate is not a rate: the employee's saved rate is left exactly as it is (and so nothing is recalculated). Every other imported
        // field is updated as before. An explicit rate, including an explicit 0, is applied as before.
        const rateProvided = row.manhourExpenses !== undefined;
        const changed = hourlyRateChanged(existing.rate, row.manhourExpenses);
        const run = await runEmployeeTransaction(async (tx) => {
          const { manhourExpenses: _rate, ...withoutRate } = toEmployeeData({ ...row, manhourExpenses: row.manhourExpenses ?? 0 });
          await updateEmployeeInRepository(existing.id, rateProvided ? { ...withoutRate, manhourExpenses: row.manhourExpenses as number } : withoutRate, tx);
          return changed ? recordRateChangeRun(tx, { employeeNo: row.employeeNo, previousRate: existing.rate, newRate: row.manhourExpenses as number, source: "EXCEL_IMPORT", actor: actor ?? null }) : null;
        });
        if (!rateProvided) ratesSkipped.push({ employeeNo: row.employeeNo, reason: skipReason(row), outcome: "EXISTING_RATE_KEPT" });
        if (run) runIds.push(run.runId);
        known.set(row.employeeNo, { id: existing.id, rate: rateProvided ? (row.manhourExpenses as number) : existing.rate });
        updated += 1;
      } else {
        // A new employee with a blank rate has no saved rate to keep: it is created with the column's default 0 and the row is reported so the rate can be entered.
        const newRate = row.manhourExpenses ?? 0;
        const { created, run } = await runEmployeeTransaction(async (tx) => {
          const createdRow = await createEmployeeInRepository(toEmployeeData({ ...row, manhourExpenses: newRate }), tx);
          return { created: createdRow, run: await recordRateChangeRun(tx, { employeeNo: row.employeeNo, previousRate: null, newRate, source: "EMPLOYEE_CREATE", actor: actor ?? null }) };
        });
        if (row.manhourExpenses === undefined) ratesSkipped.push({ employeeNo: row.employeeNo, reason: skipReason(row), outcome: "CREATED_WITH_DEFAULT_0" });
        if (run) runIds.push(run.runId);
        known.set(row.employeeNo, { id: created.id, rate: newRate });
        added += 1;
      }
    } catch {
      invalid += 1;
    }
  }

  let incompleteRuns = 0;
  for (const runId of runIds) {
    const summary = await processRunSafely(runId);
    if (!summary || summary.status !== "SUCCEEDED") incompleteRuns += 1;
  }

  return {
    added,
    updated,
    totalImported: added + updated,
    invalid,
    ...(runIds.length > 0 ? { costingRefresh: { runs: runIds.length, incompleteRuns } } : {}),
    ...(ratesSkipped.length > 0 ? { ratesSkipped } : {}),
  };
}

export async function getEmployeeById(id: string): Promise<EmployeeDto> {
  const employee = await findEmployeeById(id);
  return toEmployeeDto(employee);
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput, actor?: AccessTokenPayload): Promise<EmployeeDto> {
  const existing = await findEmployeeById(id);
  if (!existing) {
    throw new AppError("Employee not found.", 404);
  }

  if (input.employeeNo && input.employeeNo !== existing.employeeNo) {
    await assertEmployeeNoAvailable(input.employeeNo, id);
  }

  // Phase 4 / Option A: the save is unchanged; when it really changes the hourly rate, the recalculation of every affected project is recorded in the same
  // transaction (see manhourCostRefresh.service.ts) and processed right after it commits.
  const rateChanged = hourlyRateChanged(existing.manhourExpenses, input.manhourExpenses);
  const { updated, run } = await runEmployeeTransaction(async (tx) => {
  const saved = await updateEmployeeInRepository(id, {
    ...(input.employeeNo !== undefined && { employeeNo: input.employeeNo }),
    ...(input.employeeName !== undefined && { employeeName: input.employeeName }),
    ...(input.department !== undefined && { department: input.department }),
    ...(input.designation !== undefined && { designation: input.designation }),
    ...(input.reportingManager !== undefined && { reportingManager: input.reportingManager }),
    ...(input.grade !== undefined && { grade: input.grade }),
    ...(input.location !== undefined && { location: input.location }),
    ...(input.manhourExpenses !== undefined && { manhourExpenses: input.manhourExpenses }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.dateOfJoining !== undefined && { dateOfJoining: input.dateOfJoining }),
    ...(input.employeeType !== undefined && { employeeType: input.employeeType }),
  }, tx);
  const queued = rateChanged
    ? await recordRateChangeRun(tx, { employeeNo: saved.employeeNo, previousEmployeeNo: existing.employeeNo, previousRate: existing.manhourExpenses, newRate: saved.manhourExpenses, source: "MANUAL_UPDATE", actor: actor ?? null })
    : null;
  return { updated: saved, run: queued };
  });

  const costingRefresh = run ? await processRunSafely(run.runId) : null;
  return { ...toEmployeeDto(updated), ...(costingRefresh ? { costingRefresh } : {}) };
}

/**
 * Hard delete — no soft-delete concept for Employee (see employee.repository.ts's
 * own comment). Blocked with 409 if this employee has any ProjectResource
 * history, since there's no DB-level FK to enforce that automatically
 * (ProjectResource.employeeNo is a deliberate soft reference — see
 * schema.prisma). Same "application-level guard, no DB-level FK" approach
 * already used for Delete Permanently's Invoice Protection check.
 */
export async function deleteEmployee(id: string): Promise<void> {
  const existing = await findEmployeeById(id);
  if (!existing) {
    throw new AppError("Employee not found.", 404);
  }

  const resourceCount = await countResourcesForEmployee(existing.employeeNo);
  if (resourceCount > 0) {
    throw new AppError(
      `This employee has ${resourceCount} project assignment record(s) and cannot be deleted.`,
      409
    );
  }

  await deleteEmployeeInRepository(id);
}

export async function listEmployees(query: ListEmployeesQuery): Promise<PaginatedEmployeeListDto> {
  const { items, total } = await findEmployeesPage(
    {
      search: query.search,
      department: query.department,
      status: query.status,
      grade: query.grade,
      location: query.location,
    },
    query.sortField,
    query.sortDirection,
    query.page,
    query.pageSize
  );

  return {
    items: items.map((item) => toEmployeeDto(item)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
