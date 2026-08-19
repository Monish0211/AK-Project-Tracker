import { prisma } from "../../../shared/utils/prismaClient.js";
import type { InvoiceLineData } from "../invoice.types.js";

/**
 * All Prisma access for Invoices lives here — the service layer never
 * imports `prisma` directly (same rule as quantity.repository.ts/
 * milestone.repository.ts). No business logic, no calculations —
 * unitPriceINR/calculatedAmountINR/commercialAdjustmentINR arrive already
 * computed (ordinary create) or already known (Ingest) by
 * invoice.service.ts.
 */

export function createLine(quantityItemId: string, data: InvoiceLineData) {
  return prisma.invoiceLine.create({ data: { ...data, quantityItemId } });
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

export function updateLine(id: string, data: Partial<InvoiceLineData>) {
  return prisma.invoiceLine.update({ where: { id }, data });
}

export function deleteLine(id: string) {
  return prisma.invoiceLine.delete({ where: { id } });
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
