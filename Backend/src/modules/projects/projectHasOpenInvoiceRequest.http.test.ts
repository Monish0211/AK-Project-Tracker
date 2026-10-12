import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Project Repository — "+" Invoice Request indicator (Oct 2026). Confirms
 * ProjectDto.hasOpenInvoiceRequest is computed correctly and, critically,
 * that it NEVER changes the project's own existing invoiceWorkOrderValueINR/
 * pendingDueINR figures — those are asserted unchanged across every stage
 * below, proving the indicator is genuinely independent of the Invoice
 * Status calculation Projects.tsx derives from them.
 */

const TAG = `hasopenreq-${Date.now()}`;

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

test("Project Repository — hasOpenInvoiceRequest reflects Open/Completed correctly, never touches the Invoice Status figures", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineerRole, projectsModule, invoicesModule, raiseInvoiceApproval] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
      prisma.approvalType.findUniqueOrThrow({ where: { name: "Raise Invoice" } }),
    ]);
    const passwordHash = await hashPassword("HasOpenReqTest@123");

    const userA = await prisma.portalUser.create({
      data: {
        fullName: "HasOpenReq Requester",
        email: `${TAG}-a@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: [{ moduleId: projectsModule.id }, { moduleId: invoicesModule.id }] },
      },
    });
    const userB = await prisma.portalUser.create({
      data: {
        fullName: "HasOpenReq Raiser",
        email: `${TAG}-b@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: invoicesModule.id } },
        approvalPermissions: { create: { approvalTypeId: raiseInvoiceApproval.id } },
      },
    });
    createdUserIds.push(userA.id, userB.id);
    const tokenA = tokenFor({ ...userA, roleName: engineerRole.name });
    const tokenB = tokenFor({ ...userB, roleName: engineerRole.name });

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-10",
        prCategory: "India",
        prNo: `${TAG}-PR`,
        client: "HasOpenReq Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "HasOpenReq indicator regression",
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
        description: "HasOpenReq Test Item",
        woQty: 10,
        uom: "DAY",
        unitRate: 5000,
        exchangeRate: 1,
        unitRateINR: 5000,
        woValue: 50_000,
      },
    });

    async function fetchProjectDto() {
      const res = await fetch(`${url}/projects/${project.id}`, { headers: { Authorization: `Bearer ${tokenA}` } });
      assert.equal(res.status, 200);
      return ((await res.json()) as {
        data: { hasOpenInvoiceRequest: boolean; workOrderValueINR: number; pendingDueINR: number };
      }).data;
    }

    // 1. No InvoiceRequest at all -> false.
    const beforeAny = await fetchProjectDto();
    assert.equal(beforeAny.hasOpenInvoiceRequest, false, "no InvoiceRequest ever submitted -> false");
    assert.equal(beforeAny.workOrderValueINR, 50_000, "Invoice Status inputs must be the unchanged, real figures");
    assert.equal(beforeAny.pendingDueINR, 50_000);

    // 2. Submit a Request Invoice (Open) -> true, and the WO/pending figures must be IDENTICAL.
    const createReq = await fetch(`${url}/projects/${project.id}/invoice-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ assignedToUserId: userB.id }),
    });
    assert.equal(createReq.status, 201);

    const whileOpen = await fetchProjectDto();
    assert.equal(whileOpen.hasOpenInvoiceRequest, true, "an Open InvoiceRequest -> true");
    assert.equal(whileOpen.workOrderValueINR, 50_000, "Invoice Status inputs must remain exactly unchanged while a request is Open");
    assert.equal(whileOpen.pendingDueINR, 50_000, "pendingDueINR must NOT have moved just because a request exists");

    // 3. Raise the invoice (fulfills the request -> Completed) -> false again.
    const draftRes = await fetch(`${url}/quantity/${quantityItem.id}/invoice-lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({
        invoiceNo: `${TAG}-INV`,
        invoiceDate: new Date("2026-02-01").toISOString(),
        quantityBilled: 1,
        invoiceAmountINR: 20_000,
        status: "Raised",
      }),
    });
    assert.equal(draftRes.status, 201);

    // Fire-and-forget fulfillment — poll briefly for the request to flip to Completed.
    let fulfilled = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const row = await prisma.invoiceRequest.findFirst({ where: { projectId: project.id } });
      if (row?.status === "Completed") {
        fulfilled = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(fulfilled, "the request must be fulfilled once the invoice is raised");

    const afterFulfillment = await fetchProjectDto();
    assert.equal(afterFulfillment.hasOpenInvoiceRequest, false, "a Completed/fulfilled request -> false, never shows the '+' again");
    assert.equal(afterFulfillment.pendingDueINR, 30_000, "pendingDueINR must now reflect the REAL raised amount (50,000 - 20,000) — the Invoice Status calculation itself, completely independent of the request flag");

    // 4. A NEW Request Invoice submitted after the old one is Completed -> true
    // again ("+" visible for the new cycle), with the historical Completed
    // request from step 3 never causing this to stay false.
    const createReq2 = await fetch(`${url}/projects/${project.id}/invoice-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ assignedToUserId: userB.id }),
    });
    assert.equal(createReq2.status, 201);

    const withNewOpenAfterHistory = await fetchProjectDto();
    assert.equal(
      withNewOpenAfterHistory.hasOpenInvoiceRequest,
      true,
      "a new Open request must show '+' again, regardless of the older Completed request's history"
    );
    assert.equal(withNewOpenAfterHistory.pendingDueINR, 30_000, "the real Invoice Status figures must still be untouched by the new request");
  } finally {
    await prisma.invoiceRequestCcMember.deleteMany({ where: { invoiceRequest: { projectId: { in: createdProjectIds } } } });
    await prisma.invoiceRequest.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: createdProjectIds } } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
