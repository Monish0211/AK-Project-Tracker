import { randomUUID } from "node:crypto";
import { prisma } from "../../shared/utils/prismaClient.js";
import { floatToMinor, formatMoney } from "./money.rules.js";
import { normalizeCurrency } from "../invoices/invoiceCurrency.rules.js";

/**
 * Test-only helper. Since the Invoice Payment workflow (Nov 2026) an invoice becomes Paid ONLY by recording a payment —
 * a status PATCH to Paid is refused. Fixtures that need a Paid invoice as a precondition (the Paid email, the tracker, the
 * dashboard, currency rules...) use this to reach it the way the product does: a real POST /invoice-payments that settles
 * the whole invoice with one bank receipt. It also grants the acting user the "Edit Invoice" approval the endpoint needs,
 * exactly as those fixtures already grant their users the other invoice approvals.
 *
 * Invoice value is read from the database so the payment always matches the invoice. GST is entered as an explicit 0 when
 * the project carries GST, so the helper works for both GST and non-GST fixtures without changing what they assert.
 */
export async function settleInvoiceViaPayment(input: {
  url: string;
  authorization: string;
  userId: string;
  projectId: string;
  invoiceNo: string;
}): Promise<{ status: number; body: any }> {
  const edit = await prisma.approvalType.findFirstOrThrow({ where: { name: "Edit Invoice" } });
  await prisma.userApprovalPermission.upsert({
    where: { userId_approvalTypeId: { userId: input.userId, approvalTypeId: edit.id } },
    update: {},
    create: { userId: input.userId, approvalTypeId: edit.id },
  });

  const lines = await prisma.invoiceLine.findMany({
    where: { invoiceNo: input.invoiceNo, status: { not: "Cancelled" }, quantityItem: { projectId: input.projectId } },
  });
  if (lines.length === 0) throw new Error(`settleInvoiceViaPayment: no active lines for ${input.invoiceNo}`);
  const currency = normalizeCurrency(lines[0]!.currency);
  const total = lines.reduce((sum, line) => sum + floatToMinor(line.invoiceAmountOriginal ?? line.invoiceAmountINR, currency), 0n);

  const res = await fetch(`${input.url}/invoice-payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: input.authorization },
    body: JSON.stringify({
      projectId: input.projectId,
      invoiceNo: input.invoiceNo,
      idempotencyKey: randomUUID(),
      currency,
      receipts: [{ paymentDate: new Date().toISOString().slice(0, 10), amountReceived: formatMoney(total, currency), reference: `TEST-${randomUUID().slice(0, 8)}` }],
      adjustments: [],
    }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
