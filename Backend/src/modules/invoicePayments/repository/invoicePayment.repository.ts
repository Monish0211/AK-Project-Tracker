import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";

/**
 * Invoice Payment workflow (Nov 2026) — persistence only. No business rules here and no dependency on any service, so
 * invoice.service.ts can import the guard queries below without creating an import cycle.
 *
 * An invoice is identified by (projectId, invoiceNo): there is no invoice header table, and invoice numbers are matched
 * case- and outer-whitespace-insensitively, exactly like the InvoiceNumber registry (upper(btrim(...))).
 */

type Client = Prisma.TransactionClient | typeof prisma;

export const PAYMENT_INCLUDE = {
  receipts: { orderBy: { position: "asc" } },
  adjustments: { orderBy: { position: "asc" } },
} as const satisfies Prisma.InvoicePaymentInclude;

export type PaymentRow = Prisma.InvoicePaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

/** Every invoice line (any status) of one invoice of one project, oldest first. */
export async function findInvoiceLines(projectId: string, invoiceNo: string, client: Client = prisma) {
  // One round trip (it used to be an id lookup followed by a second fetch). Invoice numbers are trimmed on write (the invoice
  // validators), so a case-insensitive equality on the trimmed input matches exactly what the old upper(btrim()) comparison did.
  return client.invoiceLine.findMany({
    where: { quantityItem: { projectId }, invoiceNo: { equals: invoiceNo.trim(), mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });
}

export function findPaymentsForInvoice(projectId: string, invoiceNo: string, client: Client = prisma): Promise<PaymentRow[]> {
  return client.invoicePayment.findMany({
    where: { projectId, invoiceNo: { equals: invoiceNo.trim(), mode: "insensitive" } },
    include: PAYMENT_INCLUDE,
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
  });
}

export function findPaymentById(id: string, client: Client = prisma): Promise<PaymentRow | null> {
  return client.invoicePayment.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
}

export function findPaymentByIdempotencyKey(key: string, client: Client = prisma): Promise<PaymentRow | null> {
  return client.invoicePayment.findUnique({ where: { idempotencyKey: key }, include: PAYMENT_INCLUDE });
}

/** Guard used by invoice.service.ts: does this invoice have any payment that has not been reversed? */
export async function hasActivePayments(projectId: string, invoiceNo: string, client: Client = prisma): Promise<boolean> {
  const count = await client.invoicePayment.count({
    where: { projectId, status: "ACTIVE", invoiceNo: { equals: invoiceNo.trim(), mode: "insensitive" } },
  });
  return count > 0;
}

export interface NewPaymentData {
  projectId: string;
  invoiceNo: string;
  currency: string;
  gstApplicable: boolean;
  gstRatePercent: string | null;
  gstAmount: string | null;
  idempotencyKey: string;
  recordedByUserId: string;
  recordedByName: string;
  receipts: Array<{ paymentDate: string | null; currency: string; amountReceived: string; gstReceived: string; reference: string; notes: string | null }>;
  adjustments: Array<{
    category: string;
    amount: string;
    reason: string | null;
    expectedReleaseDate: string | null;
    reminderDate: string | null;
    exchangeRate: string | null;
    convertedAmount: string | null;
    countsTowardSettlement: boolean;
    settlementComponent: string | null;
    treatmentNote: string | null;
  }>;
}

export function insertPayment(tx: Prisma.TransactionClient, data: NewPaymentData): Promise<PaymentRow> {
  return tx.invoicePayment.create({
    data: {
      projectId: data.projectId,
      invoiceNo: data.invoiceNo,
      currency: data.currency,
      gstApplicable: data.gstApplicable,
      gstRatePercent: data.gstRatePercent,
      gstAmount: data.gstAmount,
      idempotencyKey: data.idempotencyKey,
      recordedByUserId: data.recordedByUserId,
      recordedByName: data.recordedByName,
      receipts: {
        create: data.receipts.map((receipt, position) => ({
          position,
          paymentDate: receipt.paymentDate ? new Date(`${receipt.paymentDate}T00:00:00.000Z`) : null,
          currency: receipt.currency,
          amountReceived: receipt.amountReceived,
          gstReceived: receipt.gstReceived,
          reference: receipt.reference,
          notes: receipt.notes,
        })),
      },
      adjustments: {
        create: data.adjustments.map((entry, position) => ({
          position,
          category: entry.category,
          amount: entry.amount,
          reason: entry.reason,
          expectedReleaseDate: entry.expectedReleaseDate ? new Date(`${entry.expectedReleaseDate}T00:00:00.000Z`) : null,
          reminderDate: entry.reminderDate ? new Date(`${entry.reminderDate}T00:00:00.000Z`) : null,
          exchangeRate: entry.exchangeRate,
          convertedAmount: entry.convertedAmount,
          countsTowardSettlement: entry.countsTowardSettlement,
          settlementComponent: entry.settlementComponent,
          treatmentNote: entry.treatmentNote,
        })),
      },
    },
    include: PAYMENT_INCLUDE,
  });
}

/** Records, once, which lines this payment moved to Paid (and what they were before). Written in the payment's own transaction. */
export function setStatusTransition(tx: Prisma.TransactionClient, paymentId: string, transition: Prisma.InputJsonValue) {
  return tx.invoicePayment.update({ where: { id: paymentId }, data: { statusTransition: transition } });
}

/** Marks an ACTIVE payment reversed. Returns false when it was already reversed (a concurrent reversal won). */
export async function markReversed(
  tx: Prisma.TransactionClient,
  paymentId: string,
  by: { userId: string; name: string; reason: string }
): Promise<boolean> {
  const result = await tx.$executeRaw`
    UPDATE "InvoicePayment"
    SET "status" = 'REVERSED', "reversedAt" = clock_timestamp(), "reversedByUserId" = ${by.userId}, "reversedByName" = ${by.name}, "reversalReason" = ${by.reason}
    WHERE "id" = ${paymentId} AND "status" = 'ACTIVE'`;
  return result === 1;
}

export type PaymentEventType = "PAYMENT_RECORDED" | "PAYMENT_REVERSED";

/** The only writer of InvoicePaymentEvent — append-only: there is deliberately no update or delete anywhere. */
export function insertPaymentEvent(
  tx: Prisma.TransactionClient,
  event: { paymentId: string; projectId: string; invoiceNo: string; eventType: PaymentEventType; actorUserId: string; actorName: string; details: Prisma.InputJsonValue }
) {
  return tx.invoicePaymentEvent.create({ data: event });
}

export function findPaymentEvents(projectId: string, invoiceNo: string) {
  return prisma.invoicePaymentEvent.findMany({
    where: { projectId, invoiceNo: { equals: invoiceNo.trim(), mode: "insensitive" } },
    orderBy: [{ occurredAt: "asc" }, { seq: "asc" }],
  });
}

/** Every ACTIVE payment of the given projects, with receipts — backs the dashboard/report cash figures. */
export function findActivePaymentsForProjects(projectIds: string[]) {
  if (projectIds.length === 0) return Promise.resolve([] as PaymentRow[]);
  return prisma.invoicePayment.findMany({
    where: { projectId: { in: projectIds }, status: "ACTIVE" },
    include: PAYMENT_INCLUDE,
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
  });
}
