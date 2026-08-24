import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import type { EmployeeData } from "../employee.types.js";

/**
 * All Prisma access for Employees lives here — the service layer never
 * imports `prisma` directly. Employee has no soft-delete concept (unlike
 * Project) — deleteEmployee() below is a real row delete, matching this
 * module's existing localStorage behavior (deleteEmployee() in
 * frontend/src/services/employeeService.ts already splices the row out
 * permanently; its own confirmation dialog already says "This action
 * cannot be undone").
 */

export function createEmployee(data: EmployeeData) {
  return prisma.employee.create({ data });
}

export function findEmployeeById(id: string) {
  return prisma.employee.findUnique({ where: { id } });
}

/** Optional `tx` (P1-04) lets a caller read this on its own already-open transaction connection instead of a separate one — defaults to the plain client, so every pre-existing caller is unaffected. */
export function findEmployeeByEmployeeNo(employeeNo: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.employee.findUnique({ where: { employeeNo } });
}

/** P1-10 — one bulk lookup backing bulkImportEmployees()'s existence check, replacing what used to be one findEmployeeByEmployeeNo() SELECT per imported row. */
export function findEmployeesByEmployeeNos(employeeNos: string[]) {
  if (employeeNos.length === 0) return Promise.resolve([]);
  return prisma.employee.findMany({
    where: { employeeNo: { in: employeeNos } },
    select: { id: true, employeeNo: true },
  });
}

/**
 * A single multi-row INSERT — atomic on its own (all rows land or none do).
 * Used only by the legacy migration path (loadEmployeesForApp() on the
 * frontend) — the Excel import endpoint below does a per-row upsert instead,
 * matching the existing importEmployeesFromExcel()'s add-or-update semantics
 * exactly (see employee.service.ts's importEmployeesFromExcel()).
 */
export function createEmployeesBulk(rows: EmployeeData[]) {
  return prisma.employee.createManyAndReturn({ data: rows });
}

export function updateEmployee(id: string, data: Partial<EmployeeData>) {
  return prisma.employee.update({ where: { id }, data });
}

export function deleteEmployee(id: string) {
  return prisma.employee.delete({ where: { id } });
}

export interface EmployeeListFilters {
  search?: string | undefined;
  department?: string | undefined;
  status?: string | undefined;
  grade?: string | undefined;
  location?: string | undefined;
}

function buildWhereClause(filters: EmployeeListFilters): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {};

  if (filters.department) where.department = filters.department;
  if (filters.status) where.status = filters.status;
  if (filters.grade) where.grade = filters.grade;
  if (filters.location) where.location = filters.location;

  if (filters.search) {
    where.OR = [
      { employeeNo: { contains: filters.search, mode: "insensitive" } },
      { employeeName: { contains: filters.search, mode: "insensitive" } },
      { designation: { contains: filters.search, mode: "insensitive" } },
      { department: { contains: filters.search, mode: "insensitive" } },
      { reportingManager: { contains: filters.search, mode: "insensitive" } },
      { location: { contains: filters.search, mode: "insensitive" } },
      { grade: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function findEmployeesPage(
  filters: EmployeeListFilters,
  sortField: string,
  sortDirection: "asc" | "desc",
  page: number,
  pageSize: number
) {
  const where = buildWhereClause(filters);

  const [items, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: { [sortField]: sortDirection },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employee.count({ where }),
  ]);

  return { items, total };
}
