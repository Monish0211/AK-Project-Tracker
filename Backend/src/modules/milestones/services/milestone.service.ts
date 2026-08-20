import { Prisma } from "../../../../generated/prisma/client.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { assertProjectAccessById } from "../../../shared/utils/projectAccess.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { countNonCancelledLinesForMilestone } from "../../invoices/repository/invoice.repository.js";
import { getWorkOrderValueForProject } from "../../quantity/services/quantity.service.js";
import type { IngestMilestonesResultDto, MilestoneDto, MilestoneListDto } from "../dto/milestone.dto.js";
import {
  createMilestone as createMilestoneInRepository,
  createMilestonesWithIds,
  deleteMilestone as deleteMilestoneInRepository,
  getMilestoneById,
  getMilestonesByIds,
  getMilestonesByProjectId,
  updateMilestone as updateMilestoneInRepository,
} from "../repository/milestone.repository.js";
import type {
  CreateMilestoneInput,
  IngestMilestonesInput,
  UpdateMilestoneInput,
} from "../validators/milestone.validators.js";

type MilestoneRow = NonNullable<Awaited<ReturnType<typeof getMilestoneById>>>;
type IngestMilestoneRow = { id: string; milestoneName: string; paymentPercentage: number; dueDate?: Date | null | undefined };

/** Same id, same project — but is it actually the same data? Compared field-by-field (dueDate by value, not reference) so a genuine retry of an identical ingest call is indistinguishable from a first attempt, while a same-id call carrying different data is not silently accepted. */
function milestoneMatchesPayload(existing: MilestoneRow, incoming: IngestMilestoneRow): boolean {
  const existingDue = existing.dueDate ? existing.dueDate.getTime() : null;
  const incomingDue = incoming.dueDate ? incoming.dueDate.getTime() : null;

  return (
    existing.milestoneName === incoming.milestoneName &&
    existing.paymentPercentage === incoming.paymentPercentage &&
    existingDue === incomingDue
  );
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * amount = Work Order Value (INR) × Payment % ÷ 100 — the exact formula
 * every frontend caller already uses (normalizeProject(),
 * PaymentMilestoneCard/View, InvoiceCalculations.getMilestoneValue()).
 * Never stored, always derived at read time so it can never drift from
 * Quantity after a milestone is saved.
 */
function computeAmount(paymentPercentage: number, workOrderValueINR: number): number {
  return (workOrderValueINR * paymentPercentage) / 100;
}

function toMilestoneDto(row: MilestoneRow, workOrderValueINR: number): MilestoneDto {
  return {
    id: row.id,
    projectId: row.projectId,
    milestoneName: row.milestoneName,
    paymentPercentage: row.paymentPercentage,
    dueDate: row.dueDate,
    amount: computeAmount(row.paymentPercentage, workOrderValueINR),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Throws AppError(404) if the project doesn't exist, or 403 if the caller isn't authorized for it — see shared/utils/projectAccess.ts. */
async function assertProjectExists(projectId: string, user: AccessTokenPayload): Promise<void> {
  await assertProjectAccessById(projectId, user);
}

export async function createMilestoneForProject(
  projectId: string,
  input: CreateMilestoneInput,
  user: AccessTokenPayload
): Promise<MilestoneDto> {
  await assertProjectExists(projectId, user);

  const created = await createMilestoneInRepository(projectId, {
    milestoneName: input.milestoneName,
    paymentPercentage: input.paymentPercentage,
    dueDate: input.dueDate ?? null,
  });

  const workOrderValueINR = await getWorkOrderValueForProject(projectId);
  return toMilestoneDto(created, workOrderValueINR);
}

export async function listMilestonesForProject(projectId: string, user: AccessTokenPayload): Promise<MilestoneListDto> {
  await assertProjectExists(projectId, user);

  const [rows, workOrderValueINR] = await Promise.all([
    getMilestonesByProjectId(projectId),
    getWorkOrderValueForProject(projectId),
  ]);

  return { items: rows.map((row) => toMilestoneDto(row, workOrderValueINR)) };
}

export async function updateMilestoneItem(
  id: string,
  input: UpdateMilestoneInput,
  user: AccessTokenPayload
): Promise<MilestoneDto> {
  const existing = await getMilestoneById(id);
  if (!existing) {
    throw new AppError("Milestone not found.", 404);
  }
  await assertProjectAccessById(existing.projectId, user);

  const updated = await updateMilestoneInRepository(id, {
    ...(input.milestoneName !== undefined && { milestoneName: input.milestoneName }),
    ...(input.paymentPercentage !== undefined && { paymentPercentage: input.paymentPercentage }),
    ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
  });

  const workOrderValueINR = await getWorkOrderValueForProject(updated.projectId);
  return toMilestoneDto(updated, workOrderValueINR);
}

/**
 * Single-field lookup, exported for the Invoices module (Invoices →
 * Milestones, one direction only — see invoice.service.ts, which needs a
 * milestone's paymentPercentage to derive an MLMP/Lump-Sum InvoiceLine's
 * calculatedAmountINR but has no Milestones data of its own). Returns null
 * for a milestoneId that doesn't exist rather than throwing — an
 * InvoiceLine's milestoneId is a plain, unenforced string (no FK; see
 * schema.prisma's InvoiceLine comment), so a stale/renamed reference is a
 * normal, expected case the caller decides how to handle, not this
 * function's concern.
 */
export async function getMilestonePercentageById(milestoneId: string): Promise<number | null> {
  const milestone = await getMilestoneById(milestoneId);
  return milestone ? milestone.paymentPercentage : null;
}

export async function deleteMilestoneItem(id: string, user: AccessTokenPayload): Promise<void> {
  const existing = await getMilestoneById(id);
  if (!existing) {
    throw new AppError("Milestone not found.", 404);
  }
  await assertProjectAccessById(existing.projectId, user);

  const invoiceLineCount = await countNonCancelledLinesForMilestone(id);
  if (invoiceLineCount > 0) {
    throw new AppError(
      `This payment milestone has ${invoiceLineCount} invoice line(s) raised against it and cannot be deleted.`,
      409
    );
  }

  await deleteMilestoneInRepository(id);
}

/**
 * Bounded, self-healing wrapper around createMilestonesWithIds() for the
 * one race a plain existence-check-then-insert can't close: two ingest
 * calls (or an ingest racing a legacy-migration retry) both pass the
 * "does this id exist yet" check before either has inserted, and the
 * second INSERT then collides on the id's unique constraint. Postgres
 * aborts a createMany's entire multi-row INSERT statement on any one
 * collision, so a caught violation here means NONE of `rows` landed —
 * never a partial write to reason about.
 *
 * On a caught violation: re-fetch exactly the ids in `rows`, treat any
 * that now exist with MATCHING data as the other writer's legitimate
 * insert (idempotent — nothing lost, nothing duplicated), reject outright
 * if any now exist with DIFFERENT data (the same conflict rule as the
 * ordinary pre-check, just discovered a moment later), merge the
 * newly-visible rows into `existingById` so the caller's final id→row
 * lookup still resolves them, and retry inserting only whatever is still
 * genuinely missing. Retries at most once — a second collision in a row
 * means a persistent anomaly (e.g. a third concurrent writer), not a
 * one-off race, and is surfaced as a clear, retryable 409 rather than
 * looping or ever letting a raw Prisma error reach the client as a 500.
 */
async function createMilestonesWithIdsSafely(
  projectId: string,
  rows: IngestMilestoneRow[],
  existingById: Map<string, MilestoneRow>,
  attempt = 1
): Promise<MilestoneRow[]> {
  if (rows.length === 0) {
    return [];
  }

  try {
    return await createMilestonesWithIds(
      projectId,
      rows.map((row) => ({
        id: row.id,
        milestoneName: row.milestoneName,
        paymentPercentage: row.paymentPercentage,
        dueDate: row.dueDate ?? null,
      }))
    );
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }
    if (attempt >= 2) {
      throw new AppError(
        "Milestone ingest hit a concurrent write conflict twice in a row. Please retry the request.",
        409
      );
    }

    const recheck = await getMilestonesByIds(rows.map((row) => row.id));
    const recheckById = new Map(recheck.map((row) => [row.id, row]));

    const nowConflicting = rows.filter((row) => {
      const found = recheckById.get(row.id);
      return found && !milestoneMatchesPayload(found, row);
    });
    if (nowConflicting.length > 0) {
      const idsList = nowConflicting.map((c) => `"${c.id}"`).join(", ");
      throw new AppError(
        `Milestone ID(s) ${idsList} were concurrently created with different data. Ingest never overwrites an existing milestone — update it via PATCH /milestones/:id instead.`,
        409
      );
    }

    recheckById.forEach((row, id) => existingById.set(id, row));
    const stillMissing = rows.filter((row) => !recheckById.has(row.id));

    return createMilestonesWithIdsSafely(projectId, stillMissing, existingById, attempt + 1);
  }
}

/**
 * Ingest — the ONLY path that accepts and persists a caller-supplied `id`.
 * Used exclusively by the legacy-migration step (a project's Milestones
 * being loaded into the backend for the first time) and, in the future,
 * Excel Import's Milestones sheet — never by the ordinary "Add Payment" UI
 * action. See docs/PMO_PORTAL_TECHNICAL_DOCUMENTATION.md's Payment
 * Milestone ID Stability Strategy for the full rationale.
 *
 * Idempotent, precisely: a row whose id already exists for THIS project
 * with the EXACT SAME milestoneName/paymentPercentage/dueDate is a no-op
 * (returns the existing row unchanged) — a genuine retry of an identical
 * call never fails. A row whose id already exists for this project with
 * DIFFERENT data is rejected with 409 — ingest is for adopting a
 * not-yet-backend-known record, never for silently overwriting one that's
 * already there; an actual edit must go through PATCH /milestones/:id. An
 * id that already belongs to a DIFFERENT project is rejected outright —
 * the one place a client-supplied id needs a security boundary, since
 * without this check one project's data could be made to satisfy another
 * project's invoice references. All three checks reject the WHOLE batch —
 * nothing is written until every row in it is known to be safe.
 *
 * All-or-nothing for the rows that actually need creating, same as
 * bulkImportProjects()/createProjectsBulk() — one atomic multi-row INSERT,
 * made race-safe by createMilestonesWithIdsSafely() above. Response order
 * matches the request's milestones[] order (matched back by id, which is
 * unique per row within the batch by construction — checked below — rather
 * than assumed from DB insert order).
 */
export async function ingestMilestonesForProject(
  projectId: string,
  input: IngestMilestonesInput,
  user: AccessTokenPayload
): Promise<IngestMilestonesResultDto> {
  await assertProjectExists(projectId, user);

  const ids = input.milestones.map((m) => m.id);

  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new AppError(`Duplicate Milestone ID "${id}" within the ingest batch.`, 409);
    }
    seen.add(id);
  }

  const existing = await getMilestonesByIds(ids);

  const foreignProjectRow = existing.find((row) => row.projectId !== projectId);
  if (foreignProjectRow) {
    throw new AppError(`Milestone ID "${foreignProjectRow.id}" already belongs to a different project.`, 409);
  }

  const existingById = new Map(existing.map((row) => [row.id, row]));

  // Same id, same project, different data — reject with a clear conflict
  // rather than silently keeping stale data or silently overwriting it.
  const conflicts = input.milestones.filter((m) => {
    const existingRow = existingById.get(m.id);
    return existingRow && !milestoneMatchesPayload(existingRow, m);
  });
  if (conflicts.length > 0) {
    const idsList = conflicts.map((c) => `"${c.id}"`).join(", ");
    throw new AppError(
      `Milestone ID(s) ${idsList} already exist with different data than supplied. Ingest never overwrites an existing milestone — update it via PATCH /milestones/:id instead.`,
      409
    );
  }

  const rowsToCreate = input.milestones.filter((m) => !existingById.has(m.id));

  const created = await createMilestonesWithIdsSafely(projectId, rowsToCreate, existingById);
  const createdById = new Map(created.map((row) => [row.id, row]));

  const workOrderValueINR = await getWorkOrderValueForProject(projectId);

  const items = input.milestones.map((m) => {
    const row = existingById.get(m.id) ?? createdById.get(m.id);
    if (!row) {
      // Should be unreachable — every id in the batch is either already
      // present (existingById, including rows merged in by a resolved
      // race), just inserted (createdById), or the request above would
      // already have thrown.
      throw new AppError(`Milestone with ID "${m.id}" was not created.`, 500);
    }
    return toMilestoneDto(row, workOrderValueINR);
  });

  return { items };
}
