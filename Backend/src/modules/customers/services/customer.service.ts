import { AppError } from "../../../shared/utils/AppError.js";
import type { CustomerDto, ImportCustomersResultDto, PaginatedCustomerListDto } from "../dto/customer.dto.js";
import type { CustomerData } from "../customer.types.js";
import {
  createCustomer as createCustomerInRepository,
  createCustomersBulk,
  deleteCustomer as deleteCustomerInRepository,
  findCustomerById,
  findCustomerByNameInsensitive,
  findCustomersPage,
  updateCustomer as updateCustomerInRepository,
} from "../repository/customer.repository.js";
import type {
  CreateCustomerInput,
  ImportCustomerRowInput,
  ImportCustomersInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "../validators/customer.validators.js";

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toCustomerDto(customer: Awaited<ReturnType<typeof findCustomerById>>): CustomerDto {
  if (!customer) {
    throw new AppError("Customer not found.", 404);
  }

  return {
    id: customer.id,
    customerCode: customer.customerCode,
    customerName: customer.customerName,
    companyName: customer.companyName,
    country: customer.country,
    contactPerson: customer.contactPerson,
    email: customer.email,
    phone: customer.phone,
    status: customer.status,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

/**
 * Case-insensitive duplicate check — mirrors customerService.ts
 * addCustomer/updateCustomer ("Customer already exists.").
 */
async function assertCustomerNameAvailable(customerName: string, excludingCustomerId?: string): Promise<void> {
  const existing = await findCustomerByNameInsensitive(customerName, excludingCustomerId);
  if (existing) {
    throw new AppError(`A customer with the name "${customerName}" already exists.`, 409);
  }
}

function toCustomerData(input: CreateCustomerInput | ImportCustomerRowInput): CustomerData {
  return {
    customerCode: emptyToNull(input.customerCode ?? undefined),
    customerName: input.customerName.trim(),
    companyName: emptyToNull(input.companyName ?? undefined),
    country: emptyToNull(input.country ?? undefined),
    contactPerson: emptyToNull(input.contactPerson ?? undefined),
    email: emptyToNull(input.email ?? undefined),
    phone: emptyToNull(input.phone ?? undefined),
    status: input.status,
  };
}

export async function createCustomer(input: CreateCustomerInput): Promise<CustomerDto> {
  await assertCustomerNameAvailable(input.customerName);
  const created = await createCustomerInRepository(toCustomerData(input));
  return toCustomerDto(created);
}

/**
 * All-or-nothing import — mirrors the existing frontend
 * importCustomersFromFile() abort-on-any-error behavior. Every row must be
 * valid and non-duplicate (within the batch and against the database)
 * before any insert runs.
 */
export async function bulkImportCustomers(input: ImportCustomersInput): Promise<ImportCustomersResultDto> {
  const errors: string[] = [];
  const seenNames = new Set<string>();
  const rows: CustomerData[] = [];

  for (let i = 0; i < input.customers.length; i++) {
    const row = input.customers[i]!;
    const rowNum = i + 1;
    const name = row.customerName.trim();
    const key = name.toLowerCase();

    if (!name) {
      errors.push(`Row ${rowNum}: Customer Name is missing.`);
      continue;
    }

    if (seenNames.has(key)) {
      errors.push(`Row ${rowNum}: Duplicate Customer Name "${name}" inside the file.`);
      continue;
    }

    const existing = await findCustomerByNameInsensitive(name);
    if (existing) {
      errors.push(`Row ${rowNum}: Customer "${name}" already exists.`);
      continue;
    }

    seenNames.add(key);
    rows.push(toCustomerData(row));
  }

  if (errors.length > 0) {
    throw new AppError(errors.slice(0, 20).join(" "), 400);
  }

  if (rows.length === 0) {
    throw new AppError("No valid customer rows found to import.", 400);
  }

  await createCustomersBulk(rows);
  return { imported: rows.length, skipped: 0 };
}

export async function getCustomerById(id: string): Promise<CustomerDto> {
  const customer = await findCustomerById(id);
  return toCustomerDto(customer);
}

export async function updateCustomer(id: string, input: UpdateCustomerInput): Promise<CustomerDto> {
  const existing = await findCustomerById(id);
  if (!existing) {
    throw new AppError("Customer not found.", 404);
  }

  if (input.customerName !== undefined && input.customerName.trim().toLowerCase() !== existing.customerName.toLowerCase()) {
    await assertCustomerNameAvailable(input.customerName, id);
  }

  const updated = await updateCustomerInRepository(id, {
    ...(input.customerCode !== undefined && { customerCode: emptyToNull(input.customerCode) }),
    ...(input.customerName !== undefined && { customerName: input.customerName.trim() }),
    ...(input.companyName !== undefined && { companyName: emptyToNull(input.companyName) }),
    ...(input.country !== undefined && { country: emptyToNull(input.country) }),
    ...(input.contactPerson !== undefined && { contactPerson: emptyToNull(input.contactPerson) }),
    ...(input.email !== undefined && { email: emptyToNull(input.email) }),
    ...(input.phone !== undefined && { phone: emptyToNull(input.phone) }),
    ...(input.status !== undefined && { status: input.status }),
  });

  return toCustomerDto(updated);
}

/** Hard delete — matches ConfirmDeleteDialog / customerService.deleteCustomer. */
export async function deleteCustomer(id: string): Promise<void> {
  const existing = await findCustomerById(id);
  if (!existing) {
    throw new AppError("Customer not found.", 404);
  }

  await deleteCustomerInRepository(id);
}

export async function listCustomers(query: ListCustomersQuery): Promise<PaginatedCustomerListDto> {
  const { items, total } = await findCustomersPage(
    {
      search: query.search,
      status: query.status,
    },
    query.sortField,
    query.sortDirection,
    query.page,
    query.pageSize
  );

  return {
    items: items.map((item) => toCustomerDto(item)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
