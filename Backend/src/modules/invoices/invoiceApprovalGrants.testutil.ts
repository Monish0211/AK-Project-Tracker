import { prisma } from "../../shared/utils/prismaClient.js";

/**
 * Test-only helper. Invoice Edit/Delete approval rights (Oct 2026): editing
 * an invoice's content now needs "Edit Invoice" and deleting a line needs
 * "Delete Invoice". Fixtures whose users edit/delete invoice lines as part of
 * what they test add these grants next to their existing "Raise Invoice"
 * grant — the same access those users had before the rights existed.
 */
export async function invoiceEditDeleteGrants(): Promise<Array<{ approvalTypeId: string }>> {
  const types = await prisma.approvalType.findMany({ where: { name: { in: ["Edit Invoice", "Delete Invoice"] } }, select: { id: true } });
  if (types.length !== 2) throw new Error("Edit Invoice / Delete Invoice approval types are missing — run the migrations");
  return types.map((t) => ({ approvalTypeId: t.id }));
}
