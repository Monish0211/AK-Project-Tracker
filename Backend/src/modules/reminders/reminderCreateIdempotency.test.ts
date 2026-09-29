import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Sept 2026 — duplicate reminder fix.
 *
 * Production showed the exact same reminder (title/date/time/repeat all
 * identical, isCompleted: true on every copy) inserted THREE times for one
 * project within ~9 seconds. Root cause traced to the frontend's Workspace
 * drawer re-invoking ReminderService.loadRemindersForProject() every time
 * it opens, which migrates a still-present legacy local-only reminder via
 * an ordinary POST — nothing previously stopped two overlapping
 * invocations (a quick reopen, or two browser tabs on the same project)
 * from both seeing "no backend reminder yet" and both creating one.
 *
 * Fixed with a lock-then-check-then-write transaction in
 * createReminderForProject() (Backend/src/modules/reminders/services/
 * reminder.service.ts) — this test proves that fix directly at the HTTP
 * layer, independent of whatever frontend timing produced the bug:
 *
 *  A. Two concurrent creates with the identical (title, reminderDate,
 *     reminderTime, repeat) collapse to exactly one row — the second
 *     request returns the SAME id as the first, never a second insert.
 *  B. A create with any of those fields genuinely different (different
 *     time, different title) is NOT treated as a duplicate — both must
 *     exist. Proves the fix cannot "break legitimate reminders that happen
 *     to have similar titles/times."
 *  C. Re-submitting the exact same payload AFTER the existing reminder was
 *     marked completed (mirroring the production evidence's
 *     isCompleted:true duplicates) still returns the existing row, not a
 *     new one — a completed reminder is not exempt from the match.
 */

const TAG = `rem-idem-${Date.now()}`;

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

function reminderPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    projectCode: `${TAG}-A`,
    title: "Draft report status to be followed",
    description: "Migrated legacy reminder",
    reminderType: "Invoice",
    priority: "High",
    status: "Pending",
    reminderDate: "2026-09-10",
    reminderTime: "10:00",
    notifyOffset: "At Due Time",
    repeat: "None",
    ...overrides,
  };
}

test("POST /projects/:projectId/reminders is idempotent for the same logical reminder, but never suppresses a genuinely different one", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const engineerRole = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const projectsModule = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
    const passwordHash = await hashPassword("ReminderIdemTest@123");

    const owner = await prisma.portalUser.create({
      data: {
        fullName: "Reminder Idempotency Owner",
        email: `${TAG}-owner@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(owner.id);
    const token = tokenFor({ ...owner, roleName: engineerRole.name });
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-09",
        prCategory: "India",
        prNo: `${TAG}-A`,
        client: "Reminder Idempotency Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "Reminder idempotency regression",
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectEndDate: new Date("2026-12-31"),
        projectStatus: "Active",
        workOrderNumber: `${TAG}-A-WO`,
        workOrderDate: new Date("2026-01-01"),
        eicName: "EIC",
        contractType: "LUMP SUM",
        pmoCoordinator: "PMO",
        createdByUserId: owner.id,
      },
    });
    createdProjectIds.push(project.id);

    async function create(body: Record<string, unknown>) {
      const res = await fetch(`${url}/projects/${project.id}/reminders`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success: boolean; data: { id: string } };
      return { status: res.status, id: json.data?.id };
    }

    // --- A: two CONCURRENT creates of the identical logical reminder ---
    const identicalPayload = reminderPayload();
    const [first, second] = await Promise.all([create(identicalPayload), create(identicalPayload)]);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.id, second.id, "two concurrent identical creates must return the SAME reminder id, never two different ones");

    const matchingRows = await prisma.projectReminder.findMany({
      where: {
        projectId: project.id,
        title: identicalPayload.title,
        reminderDate: new Date(identicalPayload.reminderDate),
        reminderTime: identicalPayload.reminderTime,
        repeat: identicalPayload.repeat,
      },
    });
    assert.equal(matchingRows.length, 1, "exactly one row must exist for this logical reminder, never two or three");

    // --- B: a genuinely different reminder (different time) is NOT
    // suppressed — proves the fix can't "break legitimate reminders that
    // happen to have similar titles/times" ---
    const differentTime = await create(reminderPayload({ reminderTime: "14:30" }));
    assert.equal(differentTime.status, 201);
    assert.notEqual(differentTime.id, first.id, "a reminder at a different time must be a genuinely new row");

    const differentTitle = await create(reminderPayload({ title: "A completely different follow-up" }));
    assert.equal(differentTitle.status, 201);
    assert.notEqual(differentTitle.id, first.id, "a reminder with a different title must be a genuinely new row");

    // --- C: after the original is marked completed (mirroring the
    // production evidence's isCompleted:true triplicate), re-submitting the
    // exact same create payload still returns the EXISTING row, not a new
    // one — completion status does not exempt a reminder from the match ---
    await prisma.projectReminder.update({ where: { id: first.id }, data: { isCompleted: true } });
    const afterCompletion = await create(identicalPayload);
    assert.equal(afterCompletion.status, 201);
    assert.equal(afterCompletion.id, first.id, "re-submitting after completion must still return the existing row, not create a duplicate");

    const totalMatchingAfter = await prisma.projectReminder.count({
      where: {
        projectId: project.id,
        title: identicalPayload.title,
        reminderDate: new Date(identicalPayload.reminderDate),
        reminderTime: identicalPayload.reminderTime,
        repeat: identicalPayload.repeat,
      },
    });
    assert.equal(totalMatchingAfter, 1, "still exactly one row after the post-completion re-submit");

    // Sanity: total reminders for this project = 1 (identical) + 2 (B) = 3.
    const allForProject = await prisma.projectReminder.findMany({ where: { projectId: project.id } });
    assert.equal(allForProject.length, 3);
  } finally {
    await prisma.projectReminder.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
