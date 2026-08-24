import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import type { CustomerData } from "../customer.types.js";

/**
 * All Prisma access for Customers lives here — the service layer never
 * imports `prisma` directly. Hard delete matches the existing frontend
 * (customerService.ts's deleteCustomer permanently removes the row).
 */

export function createCustomer(data: CustomerData) {
  return prisma.customer.create({ data });
}

export function createCustomersBulk(rows: CustomerData[]) {
  return prisma.customer.createManyAndReturn({ data: rows });
}

export function findCustomerById(id: string) {
  return prisma.customer.findUnique({ where: { id } });
}

/** Case-insensitive name lookup — matches frontend duplicate rule. */
export function findCustomerByNameInsensitive(customerName: string, excludingId?: string) {
  return prisma.customer.findFirst({
    where: {
      customerName: { equals: customerName, mode: "insensitive" },
      ...(excludingId ? { NOT: { id: excludingId } } : {}),
    },
  });
}

/**
 * P2-01 — bulk existence check backing bulkImportCustomers(), replacing
 * what used to be one findCustomerByNameInsensitive() SELECT per imported
 * row. `mode: "insensitive"` applies to the whole filter object including
 * `in`, so this is the exact same case-insensitive comparison as the
 * single-name lookup above, just evaluated against every candidate name in
 * one query. Lean projection (`customerName` only) — this exists purely to
 * build an existence set, never to read/return full customer rows.
 */
export function findCustomersByNamesInsensitive(customerNames: string[]) {
  if (customerNames.length === 0) return Promise.resolve([]);
  return prisma.customer.findMany({
    where: { customerName: { in: customerNames, mode: "insensitive" } },
    select: { customerName: true },
  });
}

export function updateCustomer(id: string, data: Partial<CustomerData>) {
  return prisma.customer.update({ where: { id }, data });
}

export function deleteCustomer(id: string) {
  return prisma.customer.delete({ where: { id } });
}

export interface CustomerListFilters {
  search?: string | undefined;
  status?: string | undefined;
}

function buildWhereClause(filters: CustomerListFilters): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {};

  if (filters.status) where.status = filters.status;

  if (filters.search) {
    where.OR = [
      { customerName: { contains: filters.search, mode: "insensitive" } },
      { companyName: { contains: filters.search, mode: "insensitive" } },
      { customerCode: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function findCustomersPage(
  filters: CustomerListFilters,
  sortField: string,
  sortDirection: "asc" | "desc",
  page: number,
  pageSize: number
) {
  const where = buildWhereClause(filters);

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { [sortField]: sortDirection },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, total };
}
