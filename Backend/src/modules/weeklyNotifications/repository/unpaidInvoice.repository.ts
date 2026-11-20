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
      projectCurrency: true,
      invoiceAmountProject: true,
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
    // Multi-country: the amount in the invoice's PROJECT currency - rupees for India / legacy (unchanged), the project's own currency for another country (its
    // INR-named amount is 0 by design). The line says which currency, so no amount is ever read as the wrong one.
    invoiceAmountINR: r.projectCurrency && r.projectCurrency !== "INR" ? Number(r.invoiceAmountProject?.toString() ?? 0) : r.invoiceAmountINR,
    projectCurrency: r.projectCurrency && r.projectCurrency !== "INR" ? r.projectCurrency : "INR",
    currency: r.currency,
    invoiceAmountOriginal: r.invoiceAmountOriginal,
  }));
}
