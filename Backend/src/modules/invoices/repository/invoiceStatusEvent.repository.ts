import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";

/**
 * Invoice Tracker (Oct 2026) — the ONE place invoice status history is written.
 *
 * Every invoice-line write in invoice.repository.ts goes through the helpers
 * here, inside the SAME database transaction as the write itself, so a status
 * change and its history event commit or roll back together. The previous
 * status is re-read under a row lock (SELECT … FOR UPDATE) inside that
 * transaction — never taken from a possibly stale earlier read — so
 * concurrent or duplicate submissions produce one consistent event sequence
 * and no event at all when the status did not actually change.
 *
 * Events are append-only: nothing here updates or deletes them, and there is
 * deliberately no foreign key to InvoiceLine or Project (see schema.prisma), so
 * deleting an invoice or a project never erases its audit trail.
 */

export type Tx = Prisma.TransactionClient;
export type Client = Tx | typeof prisma;

export type InvoiceEventType = "CREATED" | "STATUS_CHANGED" | "DELETED" | "IMPORTED";

/** Which user-initiated operation produced the event. (No system/automated status writes exist today.) */
export type InvoiceEventSource =
  | "invoice_create"
  | "invoice_update"
  | "invoice_delete"
  | "invoice_ingest"
  | "quantity_activity_delete"
  | "project_permanent_delete";

/** The authenticated actor and the operation — always built server-side from the verified token. */
export interface InvoiceAuditContext {
  actorUserId: string | null;
  actorName: string;
  source: InvoiceEventSource;
}

export interface EventLine {
  id: string;
  invoiceNo: string;
  quantityItemId: string;
}

export interface PendingEvent {
  line: EventLine;
  eventType: InvoiceEventType;
  fromStatus: string | null;
  toStatus: string | null;
}

/** Runs `work` in the caller's transaction, or opens one when handed the plain client. */
export function inTransaction<T>(client: Client, work: (tx: Tx) => Promise<T>): Promise<T> {
  if ("$transaction" in client) {
    return (client as typeof prisma).$transaction(work, { timeout: 30_000, maxWait: 10_000 });
  }
  return work(client as Tx);
}

/** One line's current row, locked for the rest of the transaction. */
export async function lockLine(tx: Tx, id: string): Promise<{ status: string; invoiceNo: string; quantityItemId: string } | null> {
  const rows = await tx.$queryRaw<{ status: string; invoiceNo: string; quantityItemId: string }[]>`
    SELECT "status", "invoiceNo", "quantityItemId" FROM "InvoiceLine" WHERE "id" = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}

/** Writes the given events (one batched insert). Throws if a line's project cannot be resolved — an audit gap is never silent. */
export async function recordEvents(tx: Tx, audit: InvoiceAuditContext, events: PendingEvent[]): Promise<void> {
  if (events.length === 0) return;
  const quantityItemIds = [...new Set(events.map((e) => e.line.quantityItemId))];
  const items = await tx.quantityItem.findMany({
    where: { id: { in: quantityItemIds } },
    select: { id: true, project: { select: { id: true, prNo: true } } },
  });
  const projectByItem = new Map(items.map((q) => [q.id, q.project]));

  await tx.invoiceStatusEvent.createMany({
    data: events.map((e) => {
      const project = projectByItem.get(e.line.quantityItemId);
      if (!project) throw new Error(`Invoice audit: no project found for quantity item ${e.line.quantityItemId}.`);
      return {
        projectId: project.id,
        prNo: project.prNo,
        invoiceLineId: e.line.id,
        invoiceNo: e.line.invoiceNo,
        eventType: e.eventType,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        actorUserId: audit.actorUserId,
        actorName: audit.actorName,
        source: audit.source,
      };
    }),
  });
}

/**
 * One DELETED event per invoice line of a project, for the permanent-delete
 * transaction (which is a batch of operations, so this is a single INSERT … SELECT
 * placed before the line delete). Must run BEFORE the InvoiceLine rows are removed.
 */
export function recordProjectInvoiceDeletionEvents(projectId: string, audit: InvoiceAuditContext) {
  return prisma.$executeRaw`
    INSERT INTO "InvoiceStatusEvent" ("projectId", "prNo", "invoiceLineId", "invoiceNo", "eventType", "fromStatus", "toStatus", "actorUserId", "actorName", "source")
    SELECT p."id", p."prNo", l."id", l."invoiceNo", 'DELETED', l."status", NULL, ${audit.actorUserId}, ${audit.actorName}, ${audit.source}
    FROM "InvoiceLine" l
    JOIN "QuantityItem" q ON q."id" = l."quantityItemId"
    JOIN "Project" p ON p."id" = q."projectId"
    WHERE p."id" = ${projectId}`;
}

// ── Reads (Invoice Tracker) ─────────────────────────────────────────────────

/** Events for these lines, oldest first — one batched query; (occurredAt, seq) is a total order. */
export async function findEventsForLines(invoiceLineIds: string[]) {
  if (invoiceLineIds.length === 0) return [];
  return prisma.invoiceStatusEvent.findMany({
    where: { invoiceLineId: { in: invoiceLineIds } },
    orderBy: [{ occurredAt: "asc" }, { seq: "asc" }],
  });
}
