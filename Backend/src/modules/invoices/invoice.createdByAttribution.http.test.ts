import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `inv-attr-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function tokenFor(user: { id: string; email: string; roleId: string; roleName: string }): string {
  return signAccessToken({ sub: user.id, email: user.email, roleId: user.roleId, roleName: user.roleName });
}

test("POST /quantity/:quantityItemId/invoice-lines always attributes createdBy to the authenticated caller, never the request body", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const engineerRole = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const invoicesModule = await prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } });
    const passwordHash = await hashPassword("InvAttrTest@123");

    const realUser = await prisma.portalUser.create({
      data: {
        fullName: "Invoice Attribution Real User",
        email: `${TAG}-real@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: invoicesModule.id } },
      },
    });
    createdUserIds.push(realUser.id);
    const token = tokenFor({ ...realUser, roleName: engineerRole.name });

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-01",
        prCategory: "India",
        prNo: `${TAG}-A`,
        client: "Invoice Attribution Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "Invoice line attribution regression",
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectEndDate: new Date("2026-12-31"),
        projectStatus: "Active",
        workOrderNumber: `${TAG}-WO`,
        workOrderDate: new Date("2026-01-01"),
        eicName: "EIC",
        contractType: "LUMP SUM",
        pmoCoordinator: "PMO",
        createdByUserId: null,
      },
    });
    createdProjectIds.push(project.id);

    const quantityItem = await prisma.quantityItem.create({
      data: {
        projectId: project.id,
        description: "Invoice Attribution Test Item",
        woQty: 5,
        uom: "DAY",
        unitRate: 2000,
        exchangeRate: 1,
        unitRateINR: 2000,
        woValue: 10000,
      },
    });

    // A malicious/spoofed createdBy in the body must be completely ignored.
    const res = await fetch(`${url}/quantity/${quantityItem.id}/invoice-lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        invoiceNo: `${TAG}-INV-1`,
        invoiceDate: new Date("2026-02-01").toISOString(),
        quantityBilled: 1,
        invoiceAmountINR: 2000,
        status: "Raised",
        createdBy: "Impersonated Administrator",
      }),
    });
    assert.equal(res.status, 201);
    const json = (await res.json()) as { data: { id: string; createdBy: string } };
    assert.equal(json.data.createdBy, "Invoice Attribution Real User");
    assert.notEqual(json.data.createdBy, "Impersonated Administrator");

    const stored = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: json.data.id } });
    assert.equal(stored.createdBy, "Invoice Attribution Real User");
  } finally {
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: createdProjectIds } } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
