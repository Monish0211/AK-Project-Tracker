import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import type { InvoiceLineData } from "../invoice.types.js";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * All Prisma access for Invoices lives here — the service layer never
 * imports `prisma` directly (same rule as quantity.repository.ts/
 * milestone.repository.ts). No business logic, no calculations —
 * unitPriceINR/calculatedAmountINR/commercialAdjustmentINR arrive already
 * computed (ordinary create) or already known (Ingest) by
 * invoice.service.ts.
 */

/**
 * P2/P3 — optional `tx` (defaults to the plain client, so every pre-existing
 * caller is unaffected) so createInvoiceLineForQuantityItem() can run this
 * INSIDE the same advisory-locked transaction its own financial-authority
 * and duplicate-milestone-billing checks now run in — same convention as
 * milestone.repository.ts's createMilestone().
 */
export function createLine(quantityItemId: string, data: InvoiceLineData, client: Client = prisma) {
  return client.invoiceLine.create({ data: { ...data, quantityItemId } });
}

/**
 * Ingest-only — one atomic multi-row INSERT where each row supplies its own
 * `id` (honored by Prisma over the column's @default), preserving the exact
 * id notifications/notificationTypes.ts's invoiceLineId may already
 * reference. Never called by the ordinary create path. Pure Prisma
 * passthrough — deliberately does NOT catch a unique-constraint violation;
 * that is business logic and is handled by the caller. See
 * invoice.service.ts's createInvoiceLinesWithIdsSafely() and
 * ingestInvoiceLinesForProject() (mirrors milestone.service.ts's own
 * createMilestonesWithIdsSafely()/ingestMilestonesForProject()).
 */
export function createLinesWithIds(rows: Array<InvoiceLineData & { id: string; quantityItemId: string }>) {
  return prisma.invoiceLine.createManyAndReturn({ data: rows });
}

export function getLineById(id: string) {
  return prisma.invoiceLine.findUnique({ where: { id } });
}

/** Ingest's idempotency/conflict bulk check — one query for the whole batch instead of one per row. */
export function getLinesByIds(ids: string[]) {
  return prisma.invoiceLine.findMany({ where: { id: { in: ids } } });
}

/** Backs listInvoiceItemsForProject()'s join — every InvoiceLine for every QuantityItem in one project. */
export function getLinesByQuantityItemIds(quantityItemIds: string[]) {
  return prisma.invoiceLine.findMany({
    where: { quantityItemId: { in: quantityItemIds } },
    orderBy: { createdAt: "asc" },
  });
}

/** P2/P3 — optional `tx`, same reasoning as createLine() above. */
export function updateLine(id: string, data: Partial<InvoiceLineData>, client: Client = prisma) {
  return client.invoiceLine.update({ where: { id }, data });
}

/** Optional `tx` (defaults to the plain client) so deleteInvoiceLine() can delete inside its currency-lock transaction. */
export function deleteLine(id: string, client: Client = prisma) {
  return client.invoiceLine.delete({ where: { id } });
}

/**
 * Backs the Quantity module's delete guard (Quantity → Invoices). Deliberately
 * imported directly from THIS repository file by quantity.service.ts,
 * bypassing invoice.service.ts — a narrow, intentional exception to the
 * "cross-module reads go through the other module's service" convention
 * (see Employees → Resources' countResourcesForEmployee() for the normal
 * shape of that rule). The exception exists because the normal direction is
 * reversed here: invoice.service.ts itself needs quantity.service.ts (to
 * read a QuantityItem's current rate for the join/derivation), so a second,
 * opposite service-to-service import back from quantity.service.ts would
 * create a genuine import cycle between the two service files. This
 * function has zero business logic (a plain count), so reading it straight
 * from the repository loses nothing while keeping the dependency graph
 * acyclic. Excludes Cancelled — a cancelled invoice line represents billing
 * that was undone, not history that should still block deletion.
 */
export function countNonCancelledLinesForQuantityItem(quantityItemId: string) {
  return prisma.invoiceLine.count({
    where: { quantityItemId, status: { not: "Cancelled" } },
  });
}

/**
 * Backs the Payment Milestones module's delete guard (Milestones →
 * Invoices). Deliberately imported directly from THIS repository file by
 * milestone.service.ts, bypassing invoice.service.ts — the same narrow,
 * intentional exception as countNonCancelledLinesForQuantityItem() above,
 * and for the identical reason: invoice.service.ts already imports FROM
 * milestone.service.ts (getMilestonePercentageById, to price a line against
 * a milestone's percentage), so a reverse service-to-service import back
 * from milestone.service.ts would create a genuine import cycle between the
 * two service files. This function has zero business logic (a plain
 * count), so reading it straight from the repository loses nothing while
 * keeping the dependency graph acyclic. Excludes Cancelled for the same
 * reason as the Quantity guard — a cancelled invoice line represents
 * billing that was undone, not history that should still block deletion.
 */
/** P13 — optional `tx` so deleteMilestoneItem() can run this INSIDE its own advisory-locked transaction, same convention as findConflictingLineForMilestone() above. */
export function countNonCancelledLinesForMilestone(milestoneId: string, client: Client = prisma) {
  return client.invoiceLine.count({
    where: { milestoneId, status: { not: "Cancelled" } },
  });
}

/**
 * Backs the duplicate-milestone-billing guard for the flat/milestone-value
 * invoice methods (Lump Sum, MLMP) — never applies to quantity-driven
 * billing (Invoice Line Items' Commercial Milestone Billing mode
 * legitimately re-bills the same milestoneId multiple times, bounded by a
 * quantity ceiling instead of a one-shot lock — see invoice.service.ts's
 * caller, which only invokes this when quantityBilled === 0).
 *
 * Scope depends on setIndex, mirroring the exact two lock shapes already
 * implemented client-side (frontend/.../InvoiceCalculations.ts):
 *  - setIndex present (MLMP — getMlmpSetRows()): locked per
 *    (quantityItemId, setIndex, milestoneId) — the same milestone template
 *    deliberately repeats across every SET/activity, so only an exact
 *    (activity, SET, milestone) tuple counts as "the same billing," not the
 *    milestoneId alone.
 *  - setIndex absent (Lump Sum — getProjectLumpSumMilestoneRows()): locked
 *    by milestoneId alone, PROJECT-WIDE — Lump Sum bills one milestone
 *    across every activity in a single cycle, so any activity's
 *    non-cancelled line for this milestone counts.
 *
 * Either way, a match under the SAME invoiceNo is not a conflict — that is
 * the existing cycle being added to/edited, exactly matching the frontend's
 * own `isLockedElsewhere = alreadyInvoiced && invoicedUnderInvoiceNo !==
 * invoiceNo` check (without this exception, Lump Sum's own multi-activity
 * single-cycle billing — several POSTs, one per activity, all sharing one
 * invoiceNo — would incorrectly reject itself). Cancelled lines never
 * count — the same "billing that was undone" rule as the Quantity/
 * Milestone delete guards.
 *
 * This is a plain check-then-insert (same shape as ProjectResource's own
 * duplicate-assignment guard — see resource.service.ts's
 * findResourceByProjectAndEmployee) — not wrapped in a transaction and no
 * database unique constraint backs it. A narrow race window exists (two
 * near-simultaneous requests could both pass this check before either
 * writes), matching the same accepted, undefended risk level as every
 * other duplicate-prevention check already in this codebase. A unique
 * constraint isn't a safe fit here anyway: the correct one would need to be
 * partial ("unique per milestoneId among non-Cancelled rows, OR unique per
 * (quantityItemId, setIndex, milestoneId) when setIndex is set") and
 * Postgres has no per-row conditional branching in a single index
 * definition — enforcing this fully at the DB level would need two
 * separate partial unique indexes with duplicated exclusion logic, a much
 * larger and riskier schema change than this single-operator tool's actual
 * concurrency profile justifies today.
 */
/**
 * P3 — now takes an optional `tx` so the read happens INSIDE the same
 * advisory-locked transaction as the actual create/update it's guarding
 * (see invoice.service.ts's assertNoDuplicateMilestoneBilling() and its
 * callers). The doc comment above describing this as "a plain
 * check-then-insert... not wrapped in a transaction" describes the
 * PRE-FIX behavior — it now is, exactly closing the race that paragraph
 * warned about.
 */
export function findConflictingLineForMilestone(
  params: {
    milestoneId: string;
    invoiceNo: string;
    setIndex: number | null;
    quantityItemId: string;
    excludeLineId?: string;
  },
  client: Client = prisma
) {
  return client.invoiceLine.findFirst({
    where: {
      milestoneId: params.milestoneId,
      status: { not: "Cancelled" },
      invoiceNo: { not: params.invoiceNo },
      ...(params.setIndex !== null ? { setIndex: params.setIndex, quantityItemId: params.quantityItemId } : {}),
      ...(params.excludeLineId ? { id: { not: params.excludeLineId } } : {}),
    },
  });
}

/**
 * P2 — the authoritative "how much has already been invoiced against this
 * QuantityItem" figure, read fresh inside the same advisory-locked
 * transaction as the write it's guarding (see invoice.service.ts's
 * assertInvoiceAmountWithinLimit()). Excludes Cancelled lines, matching
 * every other "how much is really billed" query in this file
 * (sumBilledQuantityByQuantityItemIds, countNonCancelledLinesFor...).
 * excludeLineId lets an UPDATE re-check without double-counting its own
 * pre-update row.
 */
export async function sumInvoicedAmountForQuantityItem(
  quantityItemId: string,
  excludeLineId?: string,
  client: Client = prisma
): Promise<number> {
  const result = await client.invoiceLine.aggregate({
    where: {
      quantityItemId,
      status: { not: "Cancelled" },
      ...(excludeLineId ? { id: { not: excludeLineId } } : {}),
    },
    _sum: { invoiceAmountINR: true },
  });
  return result._sum.invoiceAmountINR ?? 0;
}

/**
 * Backs the Priority #3 fix — the single query that derives "how much of
 * each QuantityItem has actually been invoiced," for however many item ids
 * the caller has (one QuantityItem, or a whole project's worth). One
 * groupBy regardless of list size — never one query per item. Excludes
 * Cancelled lines, matching the existing frontend Invoice-progress rule
 * (InvoiceCalculations.ts's getActivityCompletedQty) exactly. Callers pass
 * the result into shared/utils/quantityProgress.ts's computeInvoiceProgress().
 */
export async function sumBilledQuantityByQuantityItemIds(quantityItemIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (quantityItemIds.length === 0) return map;

  const rows = await prisma.invoiceLine.groupBy({
    by: ["quantityItemId"],
    where: { quantityItemId: { in: quantityItemIds }, status: { not: "Cancelled" } },
    _sum: { quantityBilled: true },
  });

  for (const row of rows) {
    map.set(row.quantityItemId, row._sum.quantityBilled ?? 0);
  }
  return map;
}

/**
 * Also backs the Quantity delete guard — called only once
 * countNonCancelledLinesForQuantityItem() above has confirmed zero
 * non-cancelled lines remain. The InvoiceLine.quantityItemId FK is
 * onDelete: Restrict unconditionally at the DB level (Postgres has no
 * concept of "restrict unless the row is Cancelled"), so a Cancelled line
 * left in place would still block the QuantityItem's DELETE outright. A
 * Cancelled line represents billing that was explicitly undone — once its
 * parent activity is being deleted anyway, clearing it first loses nothing
 * the guard was protecting.
 */
export function deleteCancelledLinesForQuantityItem(quantityItemId: string) {
  return prisma.invoiceLine.deleteMany({ where: { quantityItemId, status: "Cancelled" } });
}

/**
 * Request Invoice workflow (Sept 2026) — Section C: "Send Invoice To."
 * Backs sendInvoiceLineToUsers()'s recipient re-validation: caller-supplied
 * ids are never trusted as-is, only ids that resolve to a real, currently
 * active PortalUser are ever notified/emailed.
 */
export function findActiveUsersByIds(ids: string[]) {
  return prisma.portalUser.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, fullName: true, email: true },
  });
}

/**
 * Invoice Currency feature (Oct 2026) — the project-wide invoice-currency
 * lock reads/writes. Always called inside invoice.service.ts's
 * advisory-locked transaction (see enforceInvoiceCurrencyRules()), so `tx`
 * is required, never defaulted.
 */
export function findProjectInvoiceCurrency(projectId: string, client: Prisma.TransactionClient) {
  return client.project.findUnique({ where: { id: projectId }, select: { invoiceCurrency: true } });
}

/** Oldest line in this project that ever reached a genuine-invoice status (Cancelled included) — the lock inferred for projects whose invoices predate Project.invoiceCurrency. */
export function findFirstNonDraftLineCurrencyForProject(projectId: string, client: Prisma.TransactionClient) {
  return client.invoiceLine.findFirst({
    where: { quantityItem: { projectId }, status: { not: "Draft" } },
    orderBy: { createdAt: "asc" },
    select: { currency: true },
  });
}

/** Any OTHER line of the same invoice (same project + invoiceNo) whose currency or rate differs — the per-invoice consistency rule. */
export function findInvoiceSiblingWithDifferentCurrency(
  params: { projectId: string; invoiceNo: string; currency: string; exchangeRateToINR: number; excludeLineId?: string | undefined },
  client: Prisma.TransactionClient
) {
  return client.invoiceLine.findFirst({
    where: {
      quantityItem: { projectId: params.projectId },
      invoiceNo: params.invoiceNo,
      ...(params.excludeLineId && { id: { not: params.excludeLineId } }),
      OR: [{ currency: { not: params.currency } }, { exchangeRateToINR: { not: params.exchangeRateToINR } }],
    },
    select: { currency: true, exchangeRateToINR: true },
  });
}

/**
 * Persist the lock only if still unset. Raw SQL on purpose: a Prisma
 * update() would bump Project.updatedAt (@updatedAt), and raising an
 * invoice must not look like an edit to the project's own details.
 */
/**
 * Invoice Currency feature (Oct 2026) — release the project's lock after a
 * DELETE, but only when no line that ever reached a genuine-invoice status
 * remains (Raised, PartiallyPaid, Paid — and Cancelled, since a cancelled
 * line was raised and cancelling never unlocks). Any remaining such line
 * keeps the lock. Raw SQL for the same reason as
 * setProjectInvoiceCurrencyIfUnset(): never bump Project.updatedAt.
 * Returns the number of Project rows changed (0 or 1).
 */
export function clearProjectInvoiceCurrencyIfNoGenuineLines(projectId: string, client: Prisma.TransactionClient) {
  return client.$executeRaw`
    UPDATE "Project" p SET "invoiceCurrency" = NULL
    WHERE p."id" = ${projectId}
      AND p."invoiceCurrency" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "InvoiceLine" l
        JOIN "QuantityItem" q ON q."id" = l."quantityItemId"
        WHERE q."projectId" = ${projectId} AND l."status" <> 'Draft'
      )`;
}

export function setProjectInvoiceCurrencyIfUnset(projectId: string, currency: string, client: Prisma.TransactionClient) {
  return client.$executeRaw`UPDATE "Project" SET "invoiceCurrency" = ${currency} WHERE "id" = ${projectId} AND "invoiceCurrency" IS NULL`;
}

/**
 * Manual invoice numbering (Oct 2026) — the InvoiceNumber register (see
 * schema.prisma). Normalization is done IN SQL with exactly the expression
 * the migration's backfill used — upper(btrim(x, E' \t\r\n')) — so the
 * application and the database can never disagree about whether two
 * numbers are "the same".
 */
export interface InvoiceNumberRow {
  invoiceNo: string;
  projectId: string;
}

/** Serialize every write that claims/uses/releases this number (taken after the QuantityItem lock, before the currency lock). */
export async function lockInvoiceNumber(invoiceNo: string, client: Prisma.TransactionClient): Promise<void> {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('invoice-number:' || upper(btrim(${invoiceNo}, E' \t\r\n'))))`;
}

export async function findInvoiceNumber(invoiceNo: string, client: Client = prisma): Promise<InvoiceNumberRow | null> {
  const rows = await client.$queryRaw<InvoiceNumberRow[]>`
    SELECT "invoiceNo", "projectId" FROM "InvoiceNumber"
    WHERE "normalizedInvoiceNo" = upper(btrim(${invoiceNo}, E' \t\r\n'))`;
  return rows[0] ?? null;
}

/** Returns true if this call registered the number; false if it was already registered (by anyone). The unique index is the final guard. */
export async function insertInvoiceNumber(invoiceNo: string, projectId: string, client: Prisma.TransactionClient): Promise<boolean> {
  const inserted = await client.$executeRaw`
    INSERT INTO "InvoiceNumber" ("invoiceNo", "normalizedInvoiceNo", "projectId")
    VALUES (btrim(${invoiceNo}, E' \t\r\n'), upper(btrim(${invoiceNo}, E' \t\r\n')), ${projectId})
    ON CONFLICT ("normalizedInvoiceNo") DO NOTHING`;
  return inserted === 1;
}

/** Release the number only when no line of this project (any status) still carries it — i.e. its invoice was deleted outright. */
export function releaseInvoiceNumberIfUnused(invoiceNo: string, projectId: string, client: Prisma.TransactionClient) {
  return client.$executeRaw`
    DELETE FROM "InvoiceNumber" n
    WHERE n."normalizedInvoiceNo" = upper(btrim(${invoiceNo}, E' \t\r\n'))
      AND n."projectId" = ${projectId}
      AND NOT EXISTS (
        SELECT 1 FROM "InvoiceLine" l
        JOIN "QuantityItem" q ON q."id" = l."quantityItemId"
        WHERE q."projectId" = ${projectId}
          AND upper(btrim(l."invoiceNo", E' \t\r\n')) = upper(btrim(${invoiceNo}, E' \t\r\n'))
      )`;
}
