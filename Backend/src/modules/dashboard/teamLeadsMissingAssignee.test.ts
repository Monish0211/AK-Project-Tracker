import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

// Sept 2026 — Missing Assignee. Verifies buildTeamLeads()'s new
// missingAssigneeProjects derivation end-to-end through GET /dashboard/summary:
// project-level (not quantity-row-level) dedup, the centralized
// isActiveProjectStatus() scope (not a literal === "Active" check), exclusion
// of Completed/On Hold/Cancelled, and that assigning/unassigning a row makes
// the PR appear/disappear automatically on the next request (no persisted
// "missing" flag, purely derived).

const TAG = `missing-assignee-${Date.now()}`;

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

interface MissingAssigneeRow {
  id: string;
  prNo: string;
  projectTitle: string;
}

test("GET /dashboard/summary — Team Leads Missing Assignee: project-level dedup, active-status scope, dynamic (un)assignment", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [dashboardModule, projectsModule, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Dashboard" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("MissingAssigneeTest@123");

    const owner = await prisma.portalUser.create({
      data: {
        fullName: "Missing Assignee Owner",
        email: `${TAG}-owner@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        // Both Dashboard (GET /dashboard/summary) and Projects (PATCH
        // /quantity/:id, exercised below to prove dynamic (un)assignment).
        moduleAccess: { create: [{ moduleId: dashboardModule.id }, { moduleId: projectsModule.id }] },
      },
    });
    createdUserIds.push(owner.id);

    const outsider = await prisma.portalUser.create({
      data: {
        fullName: "Missing Assignee Outsider",
        email: `${TAG}-out@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: dashboardModule.id } },
      },
    });
    createdUserIds.push(outsider.id);

    async function makeProject(label: string, projectStatus: string) {
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-09",
          prCategory: "India",
          prNo: `${TAG}-${label}`,
          client: "Missing Assignee Probe",
          department: "Process",
          domesticForeign: "Domestic",
          projectTitle: `Missing Assignee probe ${label}`,
          workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01"),
          projectStatus,
          workOrderNumber: `${TAG}-${label}-WO`,
          workOrderDate: new Date("2026-01-01"),
          eicName: "EIC",
          contractType: "LUMP SUM",
          pmoCoordinator: "PMO",
          createdByUserId: owner.id,
        },
      });
      createdProjectIds.push(project.id);
      return project;
    }

    function qtyRow(projectId: string, description: string, assignedTo: string | null) {
      return {
        projectId,
        description,
        woQty: 1,
        uom: "LOT",
        currency: "INR",
        unitRate: 10000,
        exchangeRate: 1,
        unitRateINR: 10000,
        woValue: 10000,
        assignedTo,
      };
    }

    // FULLY-ASSIGNED (Active) — every row has an assignee -> must NOT appear.
    const prFull = await makeProject("FULL", "Active");
    await prisma.quantityItem.createMany({
      data: [qtyRow(prFull.id, "Activity 1", "Person A"), qtyRow(prFull.id, "Activity 2", "Person B")],
    });

    // PARTIALLY-ASSIGNED (Active) — one row missing -> must appear ONCE, not
    // once per unassigned row.
    const prPartial = await makeProject("PARTIAL", "Active");
    await prisma.quantityItem.createMany({
      data: [
        qtyRow(prPartial.id, "Activity 1", "Person A"),
        qtyRow(prPartial.id, "Activity 2", null),
        qtyRow(prPartial.id, "Activity 3", null),
      ],
    });

    // FULLY-UNASSIGNED, expanded workflow status ("KoM Completed", not the
    // literal "Active") — proves the centralized isActiveProjectStatus()
    // scope is actually used, not a hardcoded === "Active" check.
    const prWorkflow = await makeProject("WORKFLOW", "KoM Completed");
    let workflowQtyId = "";
    {
      const row = await prisma.quantityItem.create({ data: qtyRow(prWorkflow.id, "Activity 1", null) });
      workflowQtyId = row.id;
    }

    // Completed / On Hold / Cancelled, all with an unassigned row — must be
    // excluded, since they're outside the Team Leads active scope.
    const prCompleted = await makeProject("COMPLETED", "Completed");
    await prisma.quantityItem.create({ data: qtyRow(prCompleted.id, "Activity 1", null) });

    const prOnHold = await makeProject("ONHOLD", "On Hold");
    await prisma.quantityItem.create({ data: qtyRow(prOnHold.id, "Activity 1", null) });

    const prCancelled = await makeProject("CANCELLED", "Cancelled");
    await prisma.quantityItem.create({ data: qtyRow(prCancelled.id, "Activity 1", null) });

    // Unauthorized project (owned by nobody the outsider is) — must never
    // leak into the outsider's missingAssignee list.
    const prSecret = await makeProject("SECRET", "Active");
    await prisma.quantityItem.create({ data: qtyRow(prSecret.id, "Activity 1", null) });

    const ownerToken = tokenFor({ ...owner, roleName: engineerRole.name });
    const outsiderToken = tokenFor({ ...outsider, roleName: engineerRole.name });

    async function fetchMissingAssignee(token: string): Promise<MissingAssigneeRow[]> {
      const res = await fetch(`${url}/dashboard/summary`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: { teamLeads: { missingAssignee: MissingAssigneeRow[] } } };
      return body.data.teamLeads.missingAssignee;
    }

    const missingBefore = await fetchMissingAssignee(ownerToken);
    const prNos = missingBefore.map((m) => m.prNo);

    assert.equal(prNos.includes(`${TAG}-FULL`), false, "a project with every row assigned must not appear");
    assert.equal(
      prNos.filter((p) => p === `${TAG}-PARTIAL`).length,
      1,
      "a project with multiple unassigned rows must appear exactly ONCE, never duplicated per row"
    );
    assert.equal(
      prNos.includes(`${TAG}-WORKFLOW`),
      true,
      "an expanded-workflow-status project (KoM Completed) must be in scope via the centralized active-status rule"
    );
    assert.equal(prNos.includes(`${TAG}-COMPLETED`), false, "Completed must be excluded");
    assert.equal(prNos.includes(`${TAG}-ONHOLD`), false, "On Hold must be excluded");
    assert.equal(prNos.includes(`${TAG}-CANCELLED`), false, "Cancelled must be excluded");

    const partialEntry = missingBefore.find((m) => m.prNo === `${TAG}-PARTIAL`);
    assert.ok(partialEntry, "PARTIAL project must be present");
    assert.equal(partialEntry!.projectTitle, `Missing Assignee probe PARTIAL`, "projectTitle should be resolved for display");

    // Cross-account authorization — the outsider must never see PR-SECRET.
    const outsiderMissing = await fetchMissingAssignee(outsiderToken);
    assert.equal(
      outsiderMissing.some((m) => m.prNo === `${TAG}-SECRET`),
      false,
      "an unauthorized project's missing-assignee status must never leak to another account"
    );

    // Dynamic derivation — assign the WORKFLOW project's only row; it must
    // disappear from missingAssignee on the very next request, with no
    // manual sync step.
    const assignRes = await fetch(`${url}/quantity/${workflowQtyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ assignedTo: "Person C" }),
    });
    assert.equal(assignRes.status, 200);

    const missingAfterAssign = await fetchMissingAssignee(ownerToken);
    assert.equal(
      missingAfterAssign.some((m) => m.prNo === `${TAG}-WORKFLOW`),
      false,
      "assigning the only unassigned row must remove the project from Missing Assignee automatically"
    );

    // Remove the assignment again — it must reappear, still with no manual
    // synchronization required.
    const unassignRes = await fetch(`${url}/quantity/${workflowQtyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ assignedTo: null }),
    });
    assert.equal(unassignRes.status, 200);

    const missingAfterUnassign = await fetchMissingAssignee(ownerToken);
    assert.equal(
      missingAfterUnassign.some((m) => m.prNo === `${TAG}-WORKFLOW`),
      true,
      "removing the assignment again must bring the project back into Missing Assignee automatically"
    );
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
