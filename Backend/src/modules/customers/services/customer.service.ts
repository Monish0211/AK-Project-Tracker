import { AppError } from "../../../shared/utils/AppError.js";
import type { CustomerDto, ImportCustomersResultDto, PaginatedCustomerListDto } from "../dto/customer.dto.js";
import type { CustomerData } from "../customer.types.js";
import {
  createCustomer as createCustomerInRepository,
  createCustomersBulk,
  deleteCustomer as deleteCustomerInRepository,
  findCustomerById,
  findCustomerByNameInsensitive,
  findCustomersByNamesInsensitive,
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
 *
 * P2-01 (production hardening) — the database-existence check used to be
 * one findCustomerByNameInsensitive() SELECT per row, awaited inside this
 * loop. It is now ONE bulk findCustomersByNamesInsensitive() call, made
 * once before the loop starts, covering every distinct non-empty name in
 * the file (a superset — includes names that will later turn out to be
 * in-file duplicates too, which costs nothing extra since it's already a
 * single query regardless). The loop below is otherwise byte-for-byte the
 * same sequential algorithm as before, with only the DB `await` replaced
 * by a synchronous lookup (`existingKeys.has(key)`) against that
 * pre-fetched set — including its own exact pre-existing ordering quirk:
 * `seenNames` only ever records a name once a row has passed EVERY check
 * (missing-name, in-file-duplicate, AND database-exists), so two
 * identically-named rows that both already exist in the database each
 * still produce their own "already exists" error rather than the second
 * one being reclassified as an "in-file duplicate" — reproduced exactly,
 * not just approximated, since this task requires byte-identical error
 * behavior, not just an equivalent outcome.
 */
export async function bulkImportCustomers(input: ImportCustomersInput): Promise<ImportCustomersResultDto> {
  const errors: string[] = [];
  const seenNames = new Set<string>();
  const rows: CustomerData[] = [];

  const distinctNames = [...new Set(input.customers.map((r) => r.customerName.trim()).filter(Boolean))];
  const existingCustomers = await findCustomersByNamesInsensitive(distinctNames);
  const existingKeys = new Set(existingCustomers.map((c) => c.customerName.trim().toLowerCase()));

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

    if (existingKeys.has(key)) {
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
