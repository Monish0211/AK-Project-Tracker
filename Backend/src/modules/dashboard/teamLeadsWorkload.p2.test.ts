import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

// Aug 2026 — Team Leads Workload rule change: groups by
// QuantityItem.assignedTo instead of ProjectResource -> Employee.
// reportingManager (or Project.primaryProjectManager as a fallback). This
// file replaces that old rule's (nonexistent — no prior test covered it)
// coverage with the new one, end-to-end through the real HTTP endpoint so
// authorization is exercised for real, not mocked.

const TAG = `teamlead-p2-${Date.now()}`;

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

interface TeamLeadRow {
  reportingManager: string;
  activeProjectsCount: number;
  totalWorkOrderValue: number;
  status: string;
  projects: { id: string; prNo: string }[];
}

test("GET /dashboard/summary — Team Leads Workload groups by QuantityItem.assignedTo", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [dashboardModule, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Dashboard" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("TeamLeadP2Test@123");

    const owner = await prisma.portalUser.create({
      data: {
        fullName: "TeamLead P2 Owner",
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
        fullName: "TeamLead P2 Outsider",
        email: `${TAG}-out@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: dashboardModule.id } },
      },
    });
    createdUserIds.push(outsider.id);

    async function makeProject(label: string, primaryProjectManager: string) {
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-08",
          prCategory: "India",
          prNo: `${TAG}-${label}`,
          client: "Team Lead Workload Probe",
          department: "Process",
          domesticForeign: "Domestic",
          projectTitle: `Team Lead probe ${label}`,
          workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01"),
          projectStatus: "Active",
          workOrderNumber: `${TAG}-${label}-WO`,
          workOrderDate: new Date("2026-01-01"),
          eicName: "EIC",
          contractType: "LUMP SUM",
          pmoCoordinator: "PMO",
          primaryProjectManager,
          createdByUserId: owner.id,
        },
      });
      createdProjectIds.push(project.id);
      return project;
    }

    // PR-A: two QuantityItem rows, BOTH assigned to "Monish Kumar" — must
    // collapse to ONE project entry for Monish, not two (Test 7/duplicate
    // handling), and Primary Project Manager is a DIFFERENT person
    // ("Employee X") to prove the two concepts are independent (Test 9).
    const prA = await makeProject("A", "Employee X");
    await prisma.quantityItem.createMany({
      data: [
        {
          projectId: prA.id,
          description: "HAZOP Offline",
          woQty: 1,
          uom: "LOT",
          currency: "INR",
          unitRate: 100000,
          exchangeRate: 1,
          unitRateINR: 100000,
          woValue: 100000,
          assignedTo: "Monish Kumar",
        },
        {
          projectId: prA.id,
          description: "HAZOP Online",
          woQty: 1,
          uom: "LOT",
          currency: "INR",
          unitRate: 50000,
          exchangeRate: 1,
          unitRateINR: 50000,
          woValue: 50000,
          assignedTo: "Monish Kumar",
        },
      ],
    });

    // PR-B: assigned to Monish again (multiple-projects-for-same-person),
    // and a separate activity assigned to "Karthikeyan" on the SAME project
    // (two different assignees on one project).
    const prB = await makeProject("B", "");
    await prisma.quantityItem.createMany({
      data: [
        {
          projectId: prB.id,
          description: "SIL Assessment",
          woQty: 1,
          uom: "LOT",
          currency: "INR",
          unitRate: 30000,
          exchangeRate: 1,
          unitRateINR: 30000,
          woValue: 30000,
          assignedTo: "Monish Kumar",
        },
        {
          projectId: prB.id,
          description: "Piping Review",
          woQty: 1,
          uom: "LOT",
          currency: "INR",
          unitRate: 20000,
          exchangeRate: 1,
          unitRateINR: 20000,
          woValue: 20000,
          assignedTo: "Karthikeyan",
        },
      ],
    });

    // PR-C: unassigned QuantityItem (blank assignedTo) + a real
    // primaryProjectManager — must NOT surface as a workload entry at all
    // under the new rule (no more primaryProjectManager fallback).
    const prC = await makeProject("C", "Employee Y");
    await prisma.quantityItem.create({
      data: {
        projectId: prC.id,
        description: "Unassigned activity",
        woQty: 1,
        uom: "LOT",
        currency: "INR",
        unitRate: 10000,
        exchangeRate: 1,
        unitRateINR: 10000,
        woValue: 10000,
        assignedTo: null,
      },
    });

    // Unauthorized project: owned by nobody the outsider is, never
    // touched by outsider's own token — must not appear in outsider's view.
    const prSecret = await makeProject("SECRET", "");
    await prisma.quantityItem.create({
      data: {
        projectId: prSecret.id,
        description: "Secret activity",
        woQty: 1,
        uom: "LOT",
        currency: "INR",
        unitRate: 99000,
        exchangeRate: 1,
        unitRateINR: 99000,
        woValue: 99000,
        assignedTo: "Monish Kumar",
      },
    });
    // Force this one to be owned by `owner` only (already is, via
    // createdByUserId above) so `outsider` genuinely cannot see it.

    const ownerRes = await fetch(`${url}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${tokenFor({ ...owner, roleName: engineerRole.name })}` },
    });
    assert.equal(ownerRes.status, 200);
    const ownerJson = (await ownerRes.json()) as { data: { teamLeads: { totalReportingManagers: number; top5: TeamLeadRow[] } } };
    const leads = ownerJson.data.teamLeads.top5;

    const monish = leads.find((l) => l.reportingManager === "Monish Kumar");
    assert.ok(monish, "Monish Kumar must appear, grouped by QuantityItem.assignedTo");
    // PR-A (2 rows, same person) + PR-B (1 row) + PR-SECRET (1 row) = 3
    // DISTINCT projects, never 4 — duplicate rows within PR-A must collapse.
    assert.equal(monish!.activeProjectsCount, 3, "duplicate assignment within PR-A must not double-count that project");
    const monishPrNos = monish!.projects.map((p) => p.prNo).sort();
    assert.deepEqual(monishPrNos, [`${TAG}-A`, `${TAG}-B`, `${TAG}-SECRET`].sort());
    // Every returned project ref must carry a real id + prNo for click-through.
    for (const p of monish!.projects) {
      assert.ok(p.id && p.id.length > 0);
      assert.ok(p.prNo && p.prNo.length > 0);
    }

    const karthik = leads.find((l) => l.reportingManager === "Karthikeyan");
    assert.ok(karthik, "Karthikeyan must appear as his own separate bucket, not merged into Monish's");
    assert.equal(karthik!.activeProjectsCount, 1);
    assert.equal(karthik!.projects[0]?.prNo, `${TAG}-B`);

    // Primary Project Manager independence (Test 9): "Employee X" and
    // "Employee Y" were set as primaryProjectManager on PR-A/PR-C but have
    // NO QuantityItem.assignedTo anywhere — under the OLD rule they might
    // have surfaced via the primaryProjectManager fallback; under the NEW
    // rule they must not appear in Team Leads Workload at all.
    assert.equal(leads.some((l) => l.reportingManager === "Employee X"), false, "Primary Project Manager alone must not surface here — that's Project Leadership's job, not Quantity Assigned To's");
    assert.equal(leads.some((l) => l.reportingManager === "Employee Y"), false);

    // Unassigned QuantityItem (PR-C) contributes no bucket, and no fake
    // "Unassigned" employee name is invented.
    assert.equal(leads.some((l) => l.reportingManager === "" || l.reportingManager === "Unassigned"), false);

    // Authorization (Test 10/13): the outsider must not see PR-SECRET, and
    // Monish's count from the outsider's own vantage point (if he appears
    // at all via some OTHER project the outsider owns) must never include it.
    const outsiderRes = await fetch(`${url}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${tokenFor({ ...outsider, roleName: engineerRole.name })}` },
    });
    assert.equal(outsiderRes.status, 200);
    const outsiderJson = (await outsiderRes.json()) as { data: { teamLeads: { top5: TeamLeadRow[] } } };
    const outsiderMonish = outsiderJson.data.teamLeads.top5.find((l) => l.reportingManager === "Monish Kumar");
    if (outsiderMonish) {
      assert.equal(outsiderMonish.projects.some((p) => p.prNo === `${TAG}-SECRET`), false, "unauthorized project must never leak into any caller's workload list");
    }
  } finally {
    if (createdProjectIds.length > 0) {
      await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: createdProjectIds } } } });
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
