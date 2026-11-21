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

/**
 * Test-only helper (Administrative Controls, Nov 2026): since decision D3 a Raised / Cancelled invoice is deleted only by an Invoice
 * Administration holder (an active Administrator), with a reason. Fixtures that delete a raised invoice as part of what they test use this user;
 * the ordinary "Delete Invoice" holder is still used - and must now be refused - for those lines.
 */
export async function createInvoiceAdministrator(tag: string, moduleIds: string[]): Promise<{ id: string; headers: Record<string, string> }> {
  const { hashPassword } = await import("../../shared/utils/password.util.js");
  const { signAccessToken } = await import("../../shared/utils/jwt.util.js");
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } });
  const types = await prisma.approvalType.findMany({
    where: { name: { in: ["Raise Invoice", "Edit Invoice", "Delete Invoice", "Invoice Administration"] } },
    select: { id: true },
  });
  if (types.length !== 4) throw new Error("invoice approval types are missing - run the migrations");
  const email = `${tag}-invoice-admin@example.com`;
  const user = await prisma.portalUser.create({
    data: {
      fullName: "Invoice Administrator (test)",
      email,
      passwordHash: await hashPassword("InvoiceAdmin@123"),
      department: "Accounts",
      roleId: role.id,
      forcePasswordChange: false,
      moduleAccess: { create: moduleIds.map((moduleId) => ({ moduleId })) },
      approvalPermissions: { create: types.map((t) => ({ approvalTypeId: t.id })) },
    },
  });
  const token = signAccessToken({ sub: user.id, email, roleId: role.id, roleName: role.name });
  return { id: user.id, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
}

/** The body an administrative delete must carry. */
export const ADMIN_DELETE_BODY = JSON.stringify({ reason: "Test: administrative delete of a raised invoice" });
