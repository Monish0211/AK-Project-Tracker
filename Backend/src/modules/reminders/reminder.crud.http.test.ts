import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `reminder-crud-${Date.now()}`;

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

function projectPayload(prNo: string, createdByUserId: string | null) {
  return {
    poMonth: "2026-01",
    prCategory: "India",
    prNo,
    client: "Reminder CRUD Regression Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Reminder CRUD + cross-account visibility regression",
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

test("Reminders: create/read/update/delete + cross-account visibility follows the same project-ownership rule as every other module", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineerRole, pmoManagerRole] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
    ]);
    const projectsModule = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
    const passwordHash = await hashPassword("ReminderCrudTest@123");

    const [ownerUser, otherUser, pmoManagerUser] = await Promise.all([
      prisma.portalUser.create({
        data: {
          fullName: "Reminder Test Owner (Account A)",
          email: `${TAG}-owner@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: projectsModule.id } },
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "Reminder Test Unrelated User (Account B, no access)",
          email: `${TAG}-other@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: projectsModule.id } },
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "Reminder Test PMO Manager (Account C, unrestricted)",
          email: `${TAG}-pmomanager@example.com`,
          passwordHash,
          department: "PMO",
          roleId: pmoManagerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: projectsModule.id } },
        },
      }),
    ]);
    createdUserIds.push(ownerUser.id, otherUser.id, pmoManagerUser.id);

    // Owned by ownerUser specifically (not left "unclaimed"), so
    // canAccessProject() actually exercises its ownership branch rather
    // than its "everyone may see an unclaimed project" branch.
    const project = await prisma.project.create({ data: projectPayload(`${TAG}-A`, ownerUser.id) });
    createdProjectIds.push(project.id);

    const ownerToken = tokenFor({ ...ownerUser, roleName: engineerRole.name });
    const otherToken = tokenFor({ ...otherUser, roleName: engineerRole.name });
    const pmoManagerToken = tokenFor({ ...pmoManagerUser, roleName: pmoManagerRole.name });

    const authHeaders = (token: string) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

    // --- CREATE (Account A, the project owner) ---
    const createRes = await fetch(`${url}/projects/${project.id}/reminders`, {
      method: "POST",
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        projectCode: `${TAG}-A`,
        title: "Follow up on invoice",
        description: "Chase the client for the pending invoice",
        reminderType: "Invoice",
        priority: "High",
        status: "Pending",
        reminderDate: "2026-09-10",
        reminderTime: "09:00",
        notifyOffset: "10 Minutes Before",
        repeat: "None",
      }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as { data: { id: string; createdBy: string; projectId: string } };
    const reminderId = created.data.id;
    assert.equal(created.data.projectId, project.id);
    // createdBy must be server-derived from the authenticated session, never
    // trusted from the client (the client never even sends this field).
    assert.equal(created.data.createdBy, ownerUser.fullName);

    // --- Unauthenticated / unauthorized create ---
    const unauthCreate = await fetch(`${url}/projects/${project.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectCode: `${TAG}-A`, title: "x", reminderType: "Invoice", priority: "High", reminderDate: "2026-09-10", reminderTime: "09:00", notifyOffset: "At Due Time" }),
    });
    assert.equal(unauthCreate.status, 401);

    const otherCreate = await fetch(`${url}/projects/${project.id}/reminders`, {
      method: "POST",
      headers: authHeaders(otherToken),
      body: JSON.stringify({ projectCode: `${TAG}-A`, title: "Should be forbidden", reminderType: "Invoice", priority: "High", reminderDate: "2026-09-10", reminderTime: "09:00", notifyOffset: "At Due Time" }),
    });
    assert.equal(otherCreate.status, 403);

    // --- READ: Account B (no access to this project) cannot list or see it ---
    const otherList = await fetch(`${url}/projects/${project.id}/reminders`, { headers: authHeaders(otherToken) });
    assert.equal(otherList.status, 403);

    const otherGlobalList = await fetch(`${url}/reminders`, { headers: authHeaders(otherToken) });
    assert.equal(otherGlobalList.status, 200);
    const otherGlobalBody = (await otherGlobalList.json()) as { data: { items: Array<{ id: string }> } };
    assert.ok(
      !otherGlobalBody.data.items.some((item) => item.id === reminderId),
      "Account B must not see Account A's reminder in the global list either"
    );

    // --- READ: Account A (owner) sees it via both the project-scoped and global endpoints ---
    const ownerList = await fetch(`${url}/projects/${project.id}/reminders`, { headers: authHeaders(ownerToken) });
    assert.equal(ownerList.status, 200);
    const ownerListBody = (await ownerList.json()) as { data: { items: Array<{ id: string; title: string }> } };
    assert.ok(ownerListBody.data.items.some((item) => item.id === reminderId));

    const ownerGlobalList = await fetch(`${url}/reminders`, { headers: authHeaders(ownerToken) });
    const ownerGlobalBody = (await ownerGlobalList.json()) as { data: { items: Array<{ id: string }> } };
    assert.ok(ownerGlobalBody.data.items.some((item) => item.id === reminderId));

    // --- READ: Account C (PMO Manager — unrestricted project visibility) also sees it, proving cross-account sharing for a project it didn't create ---
    const pmoManagerList = await fetch(`${url}/projects/${project.id}/reminders`, { headers: authHeaders(pmoManagerToken) });
    assert.equal(pmoManagerList.status, 200);
    const pmoManagerListBody = (await pmoManagerList.json()) as { data: { items: Array<{ id: string }> } };
    assert.ok(
      pmoManagerListBody.data.items.some((item) => item.id === reminderId),
      "A role with unrestricted project visibility must see a reminder on a project it did not create"
    );

    // --- UPDATE: Account B is forbidden, Account A succeeds ---
    const otherUpdate = await fetch(`${url}/reminders/${reminderId}`, {
      method: "PATCH",
      headers: authHeaders(otherToken),
      body: JSON.stringify({ status: "Completed" }),
    });
    assert.equal(otherUpdate.status, 403);

    const ownerUpdate = await fetch(`${url}/reminders/${reminderId}`, {
      method: "PATCH",
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ title: "Follow up on invoice (updated)", status: "Completed" }),
    });
    assert.equal(ownerUpdate.status, 200);
    const updatedBody = (await ownerUpdate.json()) as { data: { title: string; status: string } };
    assert.equal(updatedBody.data.title, "Follow up on invoice (updated)");
    assert.equal(updatedBody.data.status, "Completed");

    // Confirms directly against the database too — not just trusting the response echo.
    const dbRowAfterUpdate = await prisma.projectReminder.findUniqueOrThrow({ where: { id: reminderId } });
    assert.equal(dbRowAfterUpdate.title, "Follow up on invoice (updated)");
    assert.equal(dbRowAfterUpdate.status, "Completed");

    // --- DELETE: Account B is forbidden, row still exists; Account A succeeds ---
    const otherDelete = await fetch(`${url}/reminders/${reminderId}`, { method: "DELETE", headers: authHeaders(otherToken) });
    assert.equal(otherDelete.status, 403);
    assert.ok(await prisma.projectReminder.findUnique({ where: { id: reminderId } }));

    const ownerDelete = await fetch(`${url}/reminders/${reminderId}`, { method: "DELETE", headers: authHeaders(ownerToken) });
    assert.equal(ownerDelete.status, 200);
    assert.equal(await prisma.projectReminder.findUnique({ where: { id: reminderId } }), null);
  } finally {
    await prisma.projectReminder.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
