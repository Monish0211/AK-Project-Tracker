import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../shared/utils/prismaClient.js";

/**
 * Invoice-level GST snapshot (Nov 2026) - persistence only, no business rules. An invoice is identified by its InvoiceNumber register
 * row (one row per invoice number, unique portal-wide); the snapshot hangs off it 1:1 and is removed with it (ON DELETE CASCADE).
 */
type Client = Prisma.TransactionClient | typeof prisma;

/** Same normalisation as the register's normalizedInvoiceNo = upper(btrim(invoiceNo, E' \t\r\n')). */
export const normalizeInvoiceNo = (invoiceNo: string): string => invoiceNo.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").toUpperCase();

export type SnapshotRow = NonNullable<Awaited<ReturnType<typeof findSnapshotByInvoiceNo>>>;

/** The register row of an invoice number, with its GST snapshot when it has one. */
export function findRegistry(invoiceNo: string, client: Client = prisma) {
  return client.invoiceNumber.findUnique({ where: { normalizedInvoiceNo: normalizeInvoiceNo(invoiceNo) }, include: { gstSnapshot: true } });
}

/** The snapshot of one invoice of one project, or null (legacy invoice / no register row / another project's number). */
export async function findSnapshotByInvoiceNo(projectId: string, invoiceNo: string, client: Client = prisma) {
  const registry = await findRegistry(invoiceNo, client);
  if (!registry || registry.projectId !== projectId) return null;
  return registry.gstSnapshot;
}

/** Snapshots of many invoices of many projects in ONE query, keyed `${projectId}\0${NORMALIZED NO}`. Invoices without a snapshot are absent. */
export async function findSnapshotsForInvoices(invoices: ReadonlyArray<{ projectId: string; invoiceNo: string }>, client: Client = prisma) {
  const result = new Map<string, NonNullable<Awaited<ReturnType<typeof findRegistry>>>["gstSnapshot"] & object>();
  if (invoices.length === 0) return result;
  const rows = await client.invoiceNumber.findMany({
    where: { normalizedInvoiceNo: { in: [...new Set(invoices.map((i) => normalizeInvoiceNo(i.invoiceNo)))] }, projectId: { in: [...new Set(invoices.map((i) => i.projectId))] }, gstSnapshot: { isNot: null } },
    include: { gstSnapshot: true },
  });
  for (const row of rows) if (row.gstSnapshot) result.set(`${row.projectId}\u0000${row.normalizedInvoiceNo}`, row.gstSnapshot);
  return result;
}

/** Every line of one invoice (any status) with just the fields the snapshot needs. */
export function findInvoiceLinesForSnapshot(projectId: string, invoiceNo: string, client: Client = prisma) {
  return client.invoiceLine.findMany({
    where: { quantityItem: { projectId }, invoiceNo: { equals: invoiceNo.trim(), mode: "insensitive" } },
    select: { id: true, status: true, currency: true, invoiceAmountINR: true, invoiceAmountOriginal: true },
  });
}

export interface SnapshotWrite {
  gstStatus: string;
  ratePercent: string | null;
  taxType: string | null;
  buyerStateKnown: boolean;
  currency: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  gstAmount: string;
  totalAmount: string;
}

export function createSnapshot(client: Prisma.TransactionClient, invoiceNumberId: string, data: SnapshotWrite, actorName: string) {
  return client.invoiceGstSnapshot.create({ data: { invoiceNumberId, ...data, createdByName: actorName, updatedByName: actorName } });
}

export function updateSnapshot(client: Prisma.TransactionClient, id: string, data: SnapshotWrite, actorName: string) {
  return client.invoiceGstSnapshot.update({ where: { id }, data: { ...data, updatedByName: actorName } });
}
