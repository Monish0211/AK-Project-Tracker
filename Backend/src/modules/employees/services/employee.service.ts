import { AppError } from "../../../shared/utils/AppError.js";
import { countResourcesForEmployee } from "../../resources/services/resource.service.js";
import type { EmployeeDto, ImportEmployeesResultDto, PaginatedEmployeeListDto } from "../dto/employee.dto.js";
import type { EmployeeData } from "../employee.types.js";
import {
  createEmployee as createEmployeeInRepository,
  deleteEmployee as deleteEmployeeInRepository,
  findEmployeeByEmployeeNo,
  findEmployeeById,
  findEmployeesPage,
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
    manhourExpenses: input.manhourExpenses,
    status: input.status,
    dateOfJoining: "dateOfJoining" in input ? input.dateOfJoining ?? null : null,
    employeeType: "employeeType" in input ? input.employeeType ?? null : null,
  };
}

export async function createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto> {
  await assertEmployeeNoAvailable(input.employeeNo);

  const created = await createEmployeeInRepository(toEmployeeData(input));
  return toEmployeeDto(created);
}

/**
 * Excel import — mirrors the existing frontend importEmployeesFromExcel()'s
 * exact semantics: each row is added or updated independently (matched by
 * employeeNo), never rejecting the whole batch the way Projects' bulk
 * import does. A row missing employeeNo/employeeName was already filtered
 * out client-side (see importEmployeeRowSchema's comment) before reaching
 * here, so every row that arrives is attempted.
 */
export async function bulkImportEmployees(input: ImportEmployeesInput): Promise<ImportEmployeesResultDto> {
  let added = 0;
  let updated = 0;
  let invalid = 0;

  for (const row of input.employees) {
    try {
      const existing = await findEmployeeByEmployeeNo(row.employeeNo);
      if (existing) {
        await updateEmployeeInRepository(existing.id, toEmployeeData(row));
        updated += 1;
      } else {
        await createEmployeeInRepository(toEmployeeData(row));
        added += 1;
      }
    } catch {
      invalid += 1;
    }
  }

  return { added, updated, totalImported: added + updated, invalid };
}

export async function getEmployeeById(id: string): Promise<EmployeeDto> {
  const employee = await findEmployeeById(id);
  return toEmployeeDto(employee);
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<EmployeeDto> {
  const existing = await findEmployeeById(id);
  if (!existing) {
    throw new AppError("Employee not found.", 404);
  }

  if (input.employeeNo && input.employeeNo !== existing.employeeNo) {
    await assertEmployeeNoAvailable(input.employeeNo, id);
  }

  const updated = await updateEmployeeInRepository(id, {
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
  });

  return toEmployeeDto(updated);
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
