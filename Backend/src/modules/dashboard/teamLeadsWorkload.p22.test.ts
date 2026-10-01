import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

// Phase 2.2 — Dashboard must cap Team Leads Workload at 5 assigned people
// (never 5 projects, never 5 Quantity rows), deterministically ordered, while
// the dedicated View All page (teamLeads.allAssigned, same /dashboard/summary
// response) must carry the COMPLETE authorized dataset. This file is
// additive — it does not touch teamLeadsWorkload.p2.test.ts's own coverage
// (grouping rule, duplicate collapsing, Primary Project Manager
// independence, authorization) which remains the source of truth for those.

const TAG = `teamlead-p22-${Date.now()}`;

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

test("GET /dashboard/summary — Team Leads Workload: Dashboard max-5, View All complete dataset, deterministic ordering", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [dashboardModule, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Dashboard" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("TeamLeadP22Test@123");

    const owner = await prisma.portalUser.create({
      data: {
        fullName: "TeamLead P22 Owner",
        email: `${TAG}-owner@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: dashboardModule.id } },
      },
    });
    createdUserIds.push(owner.id);

    async function makeProjectWithAssignee(label: string, assignedTo: string, woValue: number) {
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-08",
          prCategory: "India",
          prNo: `${TAG}-${label}`,
          client: "Team Lead Workload P22 Probe",
          department: "Process",
          domesticForeign: "Domestic",
          projectTitle: `Team Lead P22 probe ${label}`,
          workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01"),
          projectStatus: "Active",
          workOrderNumber: `${TAG}-${label}-WO`,
          workOrderDate: new Date("2026-01-01"),
          eicName: "EIC",
          contractType: "LUMP SUM",
          pmoCoordinator: "PMO",
          createdByUserId: owner.id,
        },
      });
      createdProjectIds.push(project.id);
      await prisma.quantityItem.create({
        data: {
          projectId: project.id,
          description: "Probe activity",
          woQty: 1,
          uom: "LOT",
          currency: "INR",
          unitRate: woValue,
          exchangeRate: 1,
          unitRateINR: woValue,
          woValue,
          assignedTo,
        },
      });
      return project;
    }

    // 7 distinct assigned people, each with exactly ONE active project and
    // a distinct WO value — 7 > 5, proving Dashboard must cap while View
    // All must not. Names deliberately out of alphabetical order so a
    // correct tertiary tiebreak is actually exercised, not accidentally
    // satisfied by insertion order.
    const people = [
      { label: "P1", name: "Zara Person", woValue: 100000 },
      { label: "P2", name: "Amit Person", woValue: 100000 }, // tie on count(1) AND WO value(100000) with P1 -> name asc must decide
      { label: "P3", name: "Karthik Person", woValue: 200000 },
      { label: "P4", name: "Divya Person", woValue: 300000 },
      { label: "P5", name: "Ravi Person", woValue: 400000 },
      { label: "P6", name: "Meena Person", woValue: 500000 },
      { label: "P7", name: "Suresh Person", woValue: 600000 },
    ];
    for (const p of people) {
      await makeProjectWithAssignee(p.label, p.name, p.woValue);
    }

    const res = await fetch(`${url}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${tokenFor({ ...owner, roleName: engineerRole.name })}` },
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      data: { teamLeads: { totalReportingManagers: number; top5: TeamLeadRow[]; allAssigned: TeamLeadRow[] } };
    };
    const { totalReportingManagers, top5, allAssigned } = json.data.teamLeads;

    // Isolate this test's own 7 people from whatever else may already be
    // in the local dev DB (other tests, manual data) by filtering to the
    // TAG-prefixed project set — but totalReportingManagers/top5/allAssigned
    // themselves are NOT filterable (they're global to the caller's
    // authorized scope), so assert on the >= shape plus exact presence.
    const ourNames = new Set(people.map((p) => p.name));
    const ourInAll = allAssigned.filter((l) => ourNames.has(l.reportingManager));

    // 1) Dashboard caps at maximum 5 PEOPLE, never more, regardless of how
    // many people exist in total.
    assert.ok(top5.length <= 5, `top5 must never exceed 5 rows, got ${top5.length}`);

    // 2) View All (allAssigned) contains the COMPLETE dataset — all 7 of
    // this test's people, not just 5.
    assert.equal(ourInAll.length, 7, "allAssigned must contain the complete authorized dataset, not just the top 5");

    // 3) totalReportingManagers is the TRUE total count, not the displayed
    // 5 and not a project/Quantity-row count.
    assert.equal(totalReportingManagers, allAssigned.length, "totalReportingManagers must equal the full allAssigned dataset length (View All count)");
    assert.ok(totalReportingManagers >= 7);

    // 4) Ordering is deterministic: all 7 have activeProjectsCount === 1
    // (tie), so it must fall through to totalWorkOrderValue desc, and for
    // the true tie (P1/P2, both 100000) must fall through to name asc.
    const ourOrderedInAll = allAssigned
      .map((l, index) => ({ ...l, index }))
      .filter((l) => ourNames.has(l.reportingManager))
      .sort((a, b) => a.index - b.index);
    const names = ourOrderedInAll.map((l) => l.reportingManager);
    // Expected order by (activeProjectsCount desc [all tied=1], totalWorkOrderValue desc, name asc):
    // Suresh(600000), Meena(500000), Ravi(400000), Divya(300000), Karthik(200000), then the true tie: Amit(100000) before Zara(100000).
    assert.deepEqual(names, [
      "Suresh Person",
      "Meena Person",
      "Ravi Person",
      "Divya Person",
      "Karthik Person",
      "Amit Person",
      "Zara Person",
    ]);

    // 5) Dashboard/View All consistency: top5 must be EXACTLY the first 5
    // entries of the complete allAssigned list, globally — not just among
    // this test's own 7 people. The local dev DB may hold other real/
    // leftover team-leads data outside this test's TAG-scoped set (other
    // tests, legacy createdByUserId:null projects visible under the same
    // authorization scope); if any of that data legitimately outranks one
    // of these 7 synthetic people, it is CORRECT for that person to be
    // pushed out of top5 while still appearing in allAssigned — asserting
    // "ourInTop5 == our own top 5" would be wrong in that case. Comparing
    // top5 to allAssigned.slice(0,5) is the actual invariant this phase
    // requires (README Test 9) and holds regardless of any other data.
    assert.deepEqual(
      top5.map((l) => l.reportingManager),
      allAssigned.slice(0, 5).map((l) => l.reportingManager)
    );

    // 6) Every project ref in allAssigned still carries id + prNo (PR
    // click-through requirement unchanged by this phase).
    for (const lead of ourInAll) {
      for (const p of lead.projects) {
        assert.ok(p.id && p.id.length > 0);
        assert.ok(p.prNo && p.prNo.length > 0);
      }
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
