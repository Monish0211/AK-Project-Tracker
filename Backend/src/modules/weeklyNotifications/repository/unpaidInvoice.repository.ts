import { prisma } from "../../../shared/utils/prismaClient.js";
import { UNPAID_STATUSES, type InvoiceLineCandidate } from "../unpaidInvoice.rules.js";

/**
 * Every Raised / Partially Paid invoice line on a live (non-archived) project,
 * with its project's identifying fields — ONE query (join through
 * QuantityItem -> Project), no per-invoice round trips. Read-only: nothing
 * here changes invoice statuses, payments or any accounting figure.
 */
export async function findUnpaidInvoiceLines(): Promise<InvoiceLineCandidate[]> {
  const rows = await prisma.invoiceLine.findMany({
    where: { status: { in: [...UNPAID_STATUSES] }, quantityItem: { project: { isDeleted: false } } },
    orderBy: { id: "asc" }, // deterministic report order (see findCandidateProjects)
    select: {
      id: true,
      invoiceNo: true,
      invoiceDate: true,
      status: true,
      invoiceAmountINR: true,
      currency: true,
      invoiceAmountOriginal: true,
      quantityItem: { select: { project: { select: { id: true, prNo: true, client: true, projectTitle: true, primaryProjectManager: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    projectId: r.quantityItem.project.id,
    prNo: r.quantityItem.project.prNo,
    client: r.quantityItem.project.client,
    projectTitle: r.quantityItem.project.projectTitle,
    projectManager: r.quantityItem.project.primaryProjectManager,
    invoiceNo: r.invoiceNo,
    invoiceDate: r.invoiceDate,
    status: r.status,
    invoiceAmountINR: r.invoiceAmountINR,
    currency: r.currency,
    invoiceAmountOriginal: r.invoiceAmountOriginal,
  }));
}
