import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * P2-09 — `hourlyRateSnapshot` used to be accepted directly from the client
 * on both POST /projects/:projectId/resources (create) and
 * PATCH /resources/:id (update), then persisted as-is. Both routes are
 * reachable by any authenticated Portal User with the "Projects" module
 * grant — not restricted to a trusted internal caller — so a client could
 * set an arbitrary financial figure that flows straight into manhourCost
 * and Dashboard's totalActualProjectCost.
 *
 * The authoritative rate is Employee.manhourExpenses, resolved server-side
 * at creation time and frozen forever after — proven by the schema's own
 * comment on ProjectResource.hourlyRateSnapshot ("Frozen at row creation/
 * update time from Employee.manhourExpenses — never re-derived from a later
 * Employee read") and by timesheets/services/projectResource.service.ts's
 * already-proven P1-04 recomputeProjectResource(), which this fix mirrors.
 */

const TAG = `hourlyrate-p209-${Date.now()}`;

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

function projectPayload(prNo: string, createdByUserId: string): Parameters<typeof prisma.project.create>[0]["data"] {
  return {
    poMonth: "2026-08",
    prCategory: "India",
    prNo,
    client: "P2-09 Hourly Rate Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "P2-09 hourly rate probe",
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectEndDate: new Date("2026-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    createdByUserId,
  };
}

interface ResourceResponse {
  success: boolean;
  data?: { id: string; hourlyRateSnapshot: number; manhourCost: number; totalHours: number };
  message?: string;
}

test("P2-09 — hourlyRateSnapshot is server-resolved and immune to client manipulation", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdEmployeeNos: string[] = [];

  try {
    const [projectsModule, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("HourlyRateP209Test@123");

    const owner = await prisma.portalUser.create({
      data: {
        fullName: "P2-09 Hourly Rate Owner",
        email: `${TAG}-owner@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(owner.id);
    const ownerToken = tokenFor({ ...owner, roleName: engineerRole.name });

    const project = await prisma.project.create({ data: projectPayload(`${TAG}-P`, owner.id) });
    createdProjectIds.push(project.id);

    // ---- Test 1 / 2 / 3 — create: client sends a malicious rate, DB says
    // 500 exactly (an integer-looking float, still exact) — persisted value
    // must be 500, never 999999. Omitting the field entirely is exactly
    // what a legitimate client does today (no frontend UI sends this field
    // at all — see resource.validators.ts's comment), so this is also the
    // normal-case path, not a special one.
    const empA = `${TAG}-EMP-A`;
    await prisma.employee.create({
      data: { employeeNo: empA, employeeName: "P2-09 Employee A", department: "Process", designation: "Engineer", grade: "G1", location: "HQ", manhourExpenses: 500 },
    });
    createdEmployeeNos.push(empA);

    const createRes = await fetch(`${url}/projects/${project.id}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        employeeNo: empA,
        totalHours: 10,
        workingDays: 2,
        hourlyRateSnapshot: 999999, // malicious — must be ignored
      }),
    });
    assert.equal(createRes.status, 201);
    const createdJson = (await createRes.json()) as ResourceResponse;
    assert.equal(createdJson.data!.hourlyRateSnapshot, 500);
    assert.equal(createdJson.data!.manhourCost, 10 * 500);

    const persistedA = await prisma.projectResource.findUniqueOrThrow({ where: { id: createdJson.data!.id } });
    assert.equal(persistedA.hourlyRateSnapshot, 500);
    assert.equal(persistedA.manhourCost, 5000);

    // ---- Test 3 (exact fractional rate) — a second employee/project pair
    // with a non-integer rate, to prove exactness (not rounded/truncated).
    const empB = `${TAG}-EMP-B`;
    await prisma.employee.create({
      data: { employeeNo: empB, employeeName: "P2-09 Employee B", department: "Process", designation: "Engineer", grade: "G1", location: "HQ", manhourExpenses: 750.5 },
    });
    createdEmployeeNos.push(empB);

    const createResB = await fetch(`${url}/projects/${project.id}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ employeeNo: empB, totalHours: 4, workingDays: 1 }), // no hourlyRateSnapshot at all
    });
    assert.equal(createResB.status, 201);
    const createdJsonB = (await createResB.json()) as ResourceResponse;
    assert.equal(createdJsonB.data!.hourlyRateSnapshot, 750.5);

    // ---- Employee-not-found edge case — non-blocking, defaults to 0
    // (matches recomputeProjectResource()'s own `employee?.manhourExpenses ?? 0`
    // fallback; Resources doesn't require an Employee row to exist).
    const empMissing = `${TAG}-EMP-MISSING`;
    const createResMissing = await fetch(`${url}/projects/${project.id}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ employeeNo: empMissing, totalHours: 3, hourlyRateSnapshot: 12345 }),
    });
    assert.equal(createResMissing.status, 201);
    const createdJsonMissing = (await createResMissing.json()) as ResourceResponse;
    assert.equal(createdJsonMissing.data!.hourlyRateSnapshot, 0);

    // ---- Test 4 — existing snapshot survives the Employee's rate changing
    // later: empA's rate is now bumped to 600 in Employee Master; an
    // ordinary update (changing totalHours only) must NOT re-derive the
    // resource's frozen rate.
    await prisma.employee.update({ where: { employeeNo: empA }, data: { manhourExpenses: 600 } });

    const ordinaryUpdateRes = await fetch(`${url}/resources/${createdJson.data!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ totalHours: 20 }),
    });
    assert.equal(ordinaryUpdateRes.status, 200);
    const ordinaryUpdateJson = (await ordinaryUpdateRes.json()) as ResourceResponse;
    assert.equal(ordinaryUpdateJson.data!.hourlyRateSnapshot, 500, "an Employee Master rate change must never silently change an existing resource's frozen snapshot");
    assert.equal(ordinaryUpdateJson.data!.manhourCost, 20 * 500);

    // ---- Test 5 — malicious update: explicitly try to overwrite the
    // existing (frozen) snapshot via the client payload.
    const maliciousUpdateRes = await fetch(`${url}/resources/${createdJson.data!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ hourlyRateSnapshot: 999999 }),
    });
    assert.equal(maliciousUpdateRes.status, 200);
    const maliciousUpdateJson = (await maliciousUpdateRes.json()) as ResourceResponse;
    assert.equal(maliciousUpdateJson.data!.hourlyRateSnapshot, 500);

    const persistedAfterMalice = await prisma.projectResource.findUniqueOrThrow({ where: { id: createdJson.data!.id } });
    assert.equal(persistedAfterMalice.hourlyRateSnapshot, 500);

    // ---- Test 6 — authorization is unaffected by the new lookup: a caller
    // without the Projects module grant still gets 403, never reaching the
    // employee lookup or the resource data.
    const noModuleUser = await prisma.portalUser.create({
      data: {
        fullName: "P2-09 No Module User",
        email: `${TAG}-nomodule@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(noModuleUser.id);
    const noModuleRes = await fetch(`${url}/projects/${project.id}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenFor({ ...noModuleUser, roleName: engineerRole.name })}` },
      body: JSON.stringify({ employeeNo: empA, totalHours: 1 }),
    });
    assert.equal(noModuleRes.status, 403);

    // ---- Test 7 — regression: ordinary fields still flow through
    // correctly (assignmentStatus, workingDays) alongside the corrected
    // rate handling.
    const regressionUpdateRes = await fetch(`${url}/resources/${createdJson.data!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ assignmentStatus: "Released", workingDays: 5 }),
    });
    assert.equal(regressionUpdateRes.status, 200);
    const regressionJson = (await regressionUpdateRes.json()) as { data?: { assignmentStatus: string; workingDays: number; hourlyRateSnapshot: number } };
    assert.equal(regressionJson.data?.assignmentStatus, "Released");
    assert.equal(regressionJson.data?.workingDays, 5);
    assert.equal(regressionJson.data?.hourlyRateSnapshot, 500);
  } finally {
    if (createdProjectIds.length > 0) {
      await prisma.projectResource.deleteMany({ where: { projectId: { in: createdProjectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
    if (createdEmployeeNos.length > 0) {
      await prisma.employee.deleteMany({ where: { employeeNo: { in: createdEmployeeNos } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
