import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `inv-ingest-auth-${Date.now()}`;

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

test("POST /projects/:projectId/invoice-items/ingest is Administrator-only", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [adminRole, engineerRole] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const invoicesModule = await prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } });
    const passwordHash = await hashPassword("IngestAuthTest@123");

    const adminUser = await prisma.portalUser.create({
      data: {
        fullName: "Ingest Auth Admin",
        email: `${TAG}-admin@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: invoicesModule.id } },
      },
    });
    const invoiceUser = await prisma.portalUser.create({
      data: {
        fullName: "Ingest Auth Invoice User",
        email: `${TAG}-invoiceuser@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: invoicesModule.id } },
      },
    });
    createdUserIds.push(adminUser.id, invoiceUser.id);

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-08",
        prCategory: "India",
        prNo: `${TAG}-PR`,
        client: "Ingest Auth Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "Invoice ingest authorization regression",
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
        description: "Ingest Auth Test Item",
        woQty: 10,
        uom: "DAY",
        unitRate: 1000,
        exchangeRate: 1,
        unitRateINR: 1000,
        woValue: 10000,
      },
    });

    const ingestBody = () => ({
      lines: [
        {
          id: crypto.randomUUID(),
          quantityItemId: quantityItem.id,
          invoiceNo: `${TAG}-INV-1`,
          invoiceDate: new Date("2026-02-01").toISOString(),
          quantityBilled: 0,
          unitPriceINR: 1000,
          calculatedAmountINR: 999999,
          invoiceAmountINR: 999999,
          commercialAdjustmentINR: 0,
          status: "Raised",
          createdBy: "Legacy Migration",
        },
      ],
    });

    const post = (token?: string) =>
      fetch(`${url}/projects/${project.id}/invoice-items/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(ingestBody()),
      });

    // Unauthenticated caller — 401.
    const unauth = await post();
    assert.equal(unauth.status, 401);

    // Ordinary Invoices-module user (no Administrator role) — 403, and no
    // invoice line is planted.
    const forbidden = await post(tokenFor({ ...invoiceUser, roleName: engineerRole.name }));
    assert.equal(forbidden.status, 403);
    const linesAfterForbidden = await prisma.invoiceLine.findMany({ where: { quantityItemId: quantityItem.id } });
    assert.equal(linesAfterForbidden.length, 0);

    // Administrator — allowed, and the line is actually created.
    const allowed = await post(tokenFor({ ...adminUser, roleName: adminRole.name }));
    assert.equal(allowed.status, 201);
    const linesAfterAllowed = await prisma.invoiceLine.findMany({ where: { quantityItemId: quantityItem.id } });
    assert.equal(linesAfterAllowed.length, 1);
  } finally {
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: createdProjectIds } } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
