import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `dash-p2-${Date.now()}`;

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

test("GET /dashboard/summary auth, ownership, and KPI formulas", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const unauth = await fetch(`${url}/dashboard/summary`);
    assert.equal(unauth.status, 401);

    const [dashboardModule, adminRole, readOnlyRole, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Dashboard" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Read Only" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);

    const passwordHash = await hashPassword("DashPhase2Test@123");

    const noDashUser = await prisma.portalUser.create({
      data: {
        fullName: "Dash P2 No Module",
        email: `${TAG}-nodash@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(noDashUser.id);

    const noDashRes = await fetch(`${url}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${tokenFor({ ...noDashUser, roleName: engineerRole.name })}` },
    });
    assert.equal(noDashRes.status, 403);

    const readOnlyUser = await prisma.portalUser.create({
      data: {
        fullName: "Dash P2 Read Only",
        email: `${TAG}-ro@example.com`,
        passwordHash,
        department: "PMO",
        roleId: readOnlyRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: dashboardModule.id } },
      },
    });
    createdUserIds.push(readOnlyUser.id);

    const roRes = await fetch(`${url}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${tokenFor({ ...readOnlyUser, roleName: readOnlyRole.name })}` },
    });
    assert.equal(roRes.status, 200);
    const roJson = (await roRes.json()) as { success: boolean; data: { kpis: { totalProjects: number } } };
    assert.equal(roJson.success, true);
    assert.equal(typeof roJson.data.kpis.totalProjects, "number");

    const owner = await prisma.portalUser.create({
      data: {
        fullName: "Dash P2 Owner",
        email: `${TAG}-owner@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: dashboardModule.id } },
      },
    });
    createdUserIds.push(owner.id);

    const outsider = await prisma.portalUser.create({
      data: {
        fullName: "Dash P2 Outsider",
        email: `${TAG}-out@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: dashboardModule.id } },
      },
    });
    createdUserIds.push(outsider.id);

    const secretProject = await prisma.project.create({
      data: {
        poMonth: "2026-08",
        prCategory: "India",
        prNo: `${TAG}-SECRET`,
        client: "Ownership Probe Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "Ownership probe",
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectEndDate: new Date("2026-12-31"),
        projectStatus: "Active",
        workOrderNumber: `${TAG}-WO`,
        workOrderDate: new Date("2026-01-01"),
        eicName: "EIC",
        contractType: "LUMP SUM",
        pmoCoordinator: "PMO",
        createdByUserId: owner.id,
      },
    });
    createdProjectIds.push(secretProject.id);

    await prisma.quantityItem.create({
      data: {
        projectId: secretProject.id,
        description: "WO",
        woQty: 1,
        invoiceQty: 0,
        pendingQty: 1,
        uom: "LOT",
        currency: "INR",
        unitRate: 50000,
        exchangeRate: 1,
        unitRateINR: 50000,
        woValue: 50000,
        pendingAmount: 50000,
      },
    });

    await prisma.projectExpense.create({
      data: {
        projectId: secretProject.id,
        category: "Travel",
        description: "KPI probe expense",
        quantity: 1,
        unitCost: 1000,
        totalCost: 1000,
      },
    });

    const qtyRow = await prisma.quantityItem.findFirstOrThrow({ where: { projectId: secretProject.id } });
    await prisma.invoiceLine.create({
      data: {
        quantityItemId: qtyRow.id,
        invoiceNo: `${TAG}-INV`,
        invoiceDate: new Date("2026-06-01"),
        quantityBilled: 1,
        invoiceAmountINR: 2000,
        status: "Raised",
        createdBy: owner.id,
      },
    });

    const outsiderRes = await fetch(`${url}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${tokenFor({ ...outsider, roleName: engineerRole.name })}` },
    });
    assert.equal(outsiderRes.status, 200);
    const outsiderJson = (await outsiderRes.json()) as {
      data: {
        recentProjects: { prNo: string }[];
        kpis: {
          totalWOValue: number;
          totalProjects: number;
          totalInvoiceRaised: number;
          totalPaymentReceived: number;
          totalOutstanding: number;
          totalExpenses: number;
          totalProfit: number;
        };
      };
    };
    assert.equal(
      outsiderJson.data.recentProjects.some((p) => p.prNo === `${TAG}-SECRET`),
      false
    );

    const ownerRes = await fetch(`${url}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${tokenFor({ ...owner, roleName: engineerRole.name })}` },
    });
    assert.equal(ownerRes.status, 200);
    const ownerJson = (await ownerRes.json()) as {
      data: {
        kpis: {
          totalProjects: number;
          totalWOValue: number;
          totalInvoiceRaised: number;
          totalPaymentReceived: number;
          totalOutstanding: number;
          totalExpenses: number;
          totalProfit: number;
        };
        recentProjects: { prNo: string }[];
      };
    };
    assert.equal(ownerJson.data.recentProjects.some((p) => p.prNo === `${TAG}-SECRET`), true);
    assert.equal(ownerJson.data.kpis.totalWOValue, outsiderJson.data.kpis.totalWOValue + 50000);
    assert.equal(ownerJson.data.kpis.totalProjects, outsiderJson.data.kpis.totalProjects + 1);
    assert.equal(ownerJson.data.kpis.totalInvoiceRaised, outsiderJson.data.kpis.totalInvoiceRaised + 2000);
    assert.equal(ownerJson.data.kpis.totalPaymentReceived, outsiderJson.data.kpis.totalPaymentReceived + 2000);
    assert.equal(ownerJson.data.kpis.totalExpenses, outsiderJson.data.kpis.totalExpenses + 1000);
    assert.equal(ownerJson.data.kpis.totalProfit, outsiderJson.data.kpis.totalProfit + 49000);
    assert.equal(
      ownerJson.data.kpis.totalOutstanding,
      Math.max(0, ownerJson.data.kpis.totalWOValue - ownerJson.data.kpis.totalPaymentReceived)
    );

    const admin = await prisma.portalUser.findFirst({
      where: { roleId: adminRole.id },
      include: { role: true },
    });
    assert.ok(admin);
    const adminRes = await fetch(`${url}/dashboard/summary`, {
      headers: {
        Authorization: `Bearer ${tokenFor({ id: admin.id, email: admin.email, roleId: admin.roleId, roleName: admin.role.name })}`,
      },
    });
    assert.equal(adminRes.status, 200);
    const adminJson = (await adminRes.json()) as {
      data: { kpis: { totalProjects: number }; recentProjects: { prNo: string }[] };
    };
    assert.equal(adminJson.data.recentProjects.some((p) => p.prNo === `${TAG}-SECRET`) || adminJson.data.kpis.totalProjects >= 1, true);
    assert.ok(adminJson.data.kpis.totalProjects >= ownerJson.data.kpis.totalProjects);
  } finally {
    if (createdProjectIds.length > 0) {
      await prisma.invoiceLine.deleteMany({
        where: { quantityItem: { projectId: { in: createdProjectIds } } },
      });
      await prisma.projectExpense.deleteMany({ where: { projectId: { in: createdProjectIds } } });
      await prisma.quantityItem.deleteMany({ where: { projectId: { in: createdProjectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
