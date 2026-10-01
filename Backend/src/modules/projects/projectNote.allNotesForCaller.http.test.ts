import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Sept 2026 — dedicated read-only Notes register (GET /projects/notes).
 *
 * Proves this new cross-project endpoint follows the exact same
 * project-visibility rule every other cross-project list already uses
 * (hasUnrestrictedProjectVisibility() + findAuthorizedProjects()) rather
 * than a second, independently-drifting Notes authorization concept:
 *
 *  - A normal user (project owner) sees their own project's notes.
 *  - A different normal user with no access to that project sees none of
 *    its notes, in a global list that otherwise contains their own.
 *  - PMO Manager and Administrator (unrestricted visibility) both see
 *    every project's notes, including one they didn't create.
 *  - The response is read-only data (no mutation surface) and returns each
 *    note's PR No/message/createdBy/createdAt as the dedicated page needs.
 *  - Route-mount-order regression: GET /projects/notes must reach this
 *    endpoint, never projectRoutes' GET /:id with id="notes" (see app.ts's
 *    mount-order comment) — asserting a 200 with the expected shape here
 *    already proves this, since a wrong-route hit would 404/400 instead.
 */

const TAG = `all-notes-${Date.now()}`;

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

function projectPayload(prNo: string, createdByUserId: string) {
  return {
    poMonth: "2026-01",
    prCategory: "India",
    prNo,
    client: "All Notes Register Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "All Notes register regression",
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

test("GET /projects/notes — read-only register follows the same project-visibility rule as every other cross-project list", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineerRole, pmoManagerRole, adminRole] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
    ]);
    const projectsModule = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
    const passwordHash = await hashPassword("AllNotesRegisterTest@123");

    const [ownerUser, otherUser, pmoManagerUser, adminUser] = await Promise.all([
      prisma.portalUser.create({
        data: {
          fullName: "All Notes Owner (Account A)",
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
          fullName: "All Notes Unrelated User (Account B, no access)",
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
          fullName: "All Notes PMO Manager (Account C)",
          email: `${TAG}-pmomanager@example.com`,
          passwordHash,
          department: "PMO",
          roleId: pmoManagerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: projectsModule.id } },
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "All Notes Administrator (Account D)",
          email: `${TAG}-admin@example.com`,
          passwordHash,
          department: "PMO",
          roleId: adminRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: projectsModule.id } },
        },
      }),
    ]);
    createdUserIds.push(ownerUser.id, otherUser.id, pmoManagerUser.id, adminUser.id);

    // Account A's own project, and Account B's own (unrelated) project — so
    // Account B's global list has SOMETHING in it (proving absence of A's
    // note is real exclusion, not just an empty response).
    const ownerProject = await prisma.project.create({ data: projectPayload(`${TAG}-A`, ownerUser.id) });
    const otherProject = await prisma.project.create({ data: projectPayload(`${TAG}-B`, otherUser.id) });
    createdProjectIds.push(ownerProject.id, otherProject.id);

    const ownerNote = await prisma.projectNote.create({
      data: { projectId: ownerProject.id, message: "Draft report status to be followed", createdBy: ownerUser.fullName },
    });
    const otherNote = await prisma.projectNote.create({
      data: { projectId: otherProject.id, message: "Client discussion pending", createdBy: otherUser.fullName },
    });

    const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
    const ownerToken = tokenFor({ ...ownerUser, roleName: engineerRole.name });
    const otherToken = tokenFor({ ...otherUser, roleName: engineerRole.name });
    const pmoManagerToken = tokenFor({ ...pmoManagerUser, roleName: pmoManagerRole.name });
    const adminToken = tokenFor({ ...adminUser, roleName: adminRole.name });

    type NotesResponse = {
      success: boolean;
      data: { items: { id: string; projectId: string; prNo: string; message: string; createdBy: string; createdAt: string }[] };
    };

    // --- Account A (owner): sees its own note, not Account B's ---
    const ownerRes = await fetch(`${url}/projects/notes`, { headers: authHeaders(ownerToken) });
    assert.equal(ownerRes.status, 200);
    const ownerBody = (await ownerRes.json()) as NotesResponse;
    assert.ok(ownerBody.data.items.some((n) => n.id === ownerNote.id));
    assert.ok(!ownerBody.data.items.some((n) => n.id === otherNote.id), "Account A must not see Account B's note");
    const ownerRow = ownerBody.data.items.find((n) => n.id === ownerNote.id)!;
    assert.equal(ownerRow.prNo, ownerProject.prNo);
    assert.equal(ownerRow.message, "Draft report status to be followed");
    assert.equal(ownerRow.createdBy, ownerUser.fullName);
    assert.equal(typeof ownerRow.createdAt, "string");

    // --- Account B (unrelated, no access to A's project): sees its own
    // note, never A's — proving real exclusion, not merely an empty list ---
    const otherRes = await fetch(`${url}/projects/notes`, { headers: authHeaders(otherToken) });
    assert.equal(otherRes.status, 200);
    const otherBody = (await otherRes.json()) as NotesResponse;
    assert.ok(otherBody.data.items.some((n) => n.id === otherNote.id));
    assert.ok(!otherBody.data.items.some((n) => n.id === ownerNote.id), "Account B must not see Account A's note");

    // --- PMO Manager (unrestricted visibility): sees BOTH notes ---
    const pmoManagerRes = await fetch(`${url}/projects/notes`, { headers: authHeaders(pmoManagerToken) });
    assert.equal(pmoManagerRes.status, 200);
    const pmoManagerBody = (await pmoManagerRes.json()) as NotesResponse;
    assert.ok(pmoManagerBody.data.items.some((n) => n.id === ownerNote.id), "PMO Manager must see Account A's note");
    assert.ok(pmoManagerBody.data.items.some((n) => n.id === otherNote.id), "PMO Manager must see Account B's note");

    // --- Administrator (unrestricted visibility): sees BOTH notes ---
    const adminRes = await fetch(`${url}/projects/notes`, { headers: authHeaders(adminToken) });
    assert.equal(adminRes.status, 200);
    const adminBody = (await adminRes.json()) as NotesResponse;
    assert.ok(adminBody.data.items.some((n) => n.id === ownerNote.id), "Administrator must see Account A's note");
    assert.ok(adminBody.data.items.some((n) => n.id === otherNote.id), "Administrator must see Account B's note");

    // --- Unauthenticated: rejected ---
    const unauthRes = await fetch(`${url}/projects/notes`);
    assert.equal(unauthRes.status, 401);
  } finally {
    await prisma.projectNote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
