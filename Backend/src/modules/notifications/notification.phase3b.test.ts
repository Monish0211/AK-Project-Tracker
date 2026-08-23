import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../shared/utils/prismaClient.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import type { AccessTokenPayload } from "../../shared/types/auth.types.js";
import { archiveProject, permanentlyDeleteProject, restoreProject } from "../projects/services/project.service.js";
import { createProject as createProjectInRepository } from "../projects/repository/project.repository.js";
import { createInvoiceLineForQuantityItem, updateInvoiceLine } from "../invoices/services/invoice.service.js";
import { createQuantity } from "../quantity/repository/quantity.repository.js";
import { notifyTimesheetImportOutcome } from "../timesheets/services/timesheetImportNotification.service.js";
import type { ProcessImportResult } from "../timesheets/timesheet.types.js";

/**
 * Priority #6 Phase 3B — end-to-end coverage for every approved
 * business-event notification, against the real database (real Project/
 * QuantityItem/InvoiceLine/Notification rows, real service functions —
 * never mocks), with its own isolated fixtures cleaned up afterward. Mirrors
 * notification.http.test.ts's own conventions (real DB, self-contained
 * fixtures, cleanup in `finally`) rather than inventing a second style.
 *
 * Deliberately does NOT re-test notify()'s own fire-and-forget/never-throws
 * contract (already covered by notification.http.test.ts and unchanged by
 * this phase) — these tests instead prove the NEW call sites (archive/
 * restore/permanent-delete/invoice create+update, and the Keka/manual
 * import summary) each produce exactly the right Notification row, to the
 * right recipient, with the right entity/severity/actionUrl shape.
 */

const TAG = `notif-p3b-${Date.now()}`;

async function makeUser(opts: { emailSuffix: string; modules: string[] }) {
  const [engineerRole, ...moduleRows] = await Promise.all([
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ...opts.modules.map((name) => prisma.module.findUniqueOrThrow({ where: { name } })),
  ]);
  const passwordHash = await hashPassword("NotifP3BTest@123");
  const user = await prisma.portalUser.create({
    data: {
      fullName: `Notif P3B ${opts.emailSuffix}`,
      email: `${TAG}-${opts.emailSuffix}@example.com`,
      passwordHash,
      department: "PMO",
      roleId: engineerRole.id,
      forcePasswordChange: false,
      moduleAccess: { create: moduleRows.map((m) => ({ moduleId: m.id })) },
    },
  });
  return user;
}

function asPayload(user: { id: string }, roleName = "Engineer"): AccessTokenPayload {
  return { sub: user.id, email: "", roleId: "", roleName };
}

let seq = 0;
async function makeProject(opts: { createdByUserId: string | null }) {
  seq += 1;
  return createProjectInRepository({
    poMonth: "Jan-26",
    prCategory: "India",
    prNo: `${TAG}-PR-${seq}`,
    client: "Test Client",
    department: "Engineering",
    domesticForeign: "Domestic",
    projectTitle: `Phase 3B Test Project ${seq}`,
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectStatus: "Active",
    contractType: "LUMP SUM",
    paymentType: "Single",
    createdByUserId: opts.createdByUserId,
  } as Parameters<typeof createProjectInRepository>[0]);
}

test("Phase 3B — Project lifecycle notifications (archive/restore/permanent delete)", async () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  try {
    const owner = await makeUser({ emailSuffix: "owner", modules: ["Projects"] });
    createdUserIds.push(owner.id);
    const ownerPayload = asPayload(owner);

    const project = await makeProject({ createdByUserId: owner.id });
    createdProjectIds.push(project.id);

    // ---- Archive -> notifies the owner, severity Medium, entityType Project ----
    await archiveProject(project.id, ownerPayload);
    const archiveNotifs = await prisma.notification.findMany({
      where: { userId: owner.id, type: "PROJECT_ARCHIVED", entityId: project.id },
    });
    assert.equal(archiveNotifs.length, 1, "exactly one PROJECT_ARCHIVED notification for this project");
    assert.equal(archiveNotifs[0]!.severity, "Medium");
    assert.equal(archiveNotifs[0]!.entityType, "Project");
    assert.equal(archiveNotifs[0]!.actionUrl, `/projects/edit/${project.id}`);

    // ---- Duplicate protection: archiving again 404s before ever re-notifying ----
    await assert.rejects(() => archiveProject(project.id, ownerPayload));
    const archiveNotifsAfterRetry = await prisma.notification.findMany({
      where: { userId: owner.id, type: "PROJECT_ARCHIVED", entityId: project.id },
    });
    assert.equal(archiveNotifsAfterRetry.length, 1, "a rejected re-archive must never create a second notification");

    // ---- Restore -> notifies again, severity Info ----
    await restoreProject(project.id, ownerPayload);
    const restoreNotifs = await prisma.notification.findMany({
      where: { userId: owner.id, type: "PROJECT_RESTORED", entityId: project.id },
    });
    assert.equal(restoreNotifs.length, 1);
    assert.equal(restoreNotifs[0]!.severity, "Info");

    // ---- Permanent delete -> severity Critical, entityType NULL (never a dead link), entityId preserved for history ----
    await permanentlyDeleteProject(project.id, ownerPayload);
    const deleteNotifs = await prisma.notification.findMany({
      where: { userId: owner.id, type: "PROJECT_DELETED", entityId: project.id },
    });
    assert.equal(deleteNotifs.length, 1);
    assert.equal(deleteNotifs[0]!.severity, "Critical");
    assert.equal(deleteNotifs[0]!.entityType, null, "entityType must be null for a deleted project — never a dead /projects/edit link");
    assert.equal(deleteNotifs[0]!.actionUrl, null);
    assert.equal(deleteNotifs[0]!.entityId, project.id, "entityId is still preserved as historical reference");
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    // The project itself was already permanently deleted by the test; only cascade-safe to attempt cleanup for any that weren't reached.
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } }).catch(() => {});
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test("Phase 3B — Project lifecycle notification falls back to module access when createdByUserId is null", async () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  try {
    const moduleHolder = await makeUser({ emailSuffix: "fallback", modules: ["Projects"] });
    createdUserIds.push(moduleHolder.id);
    const adminPayload: AccessTokenPayload = { sub: "admin-not-owner", email: "", roleId: "", roleName: "Administrator" };

    const unclaimedProject = await makeProject({ createdByUserId: null });
    createdProjectIds.push(unclaimedProject.id);

    await archiveProject(unclaimedProject.id, adminPayload);

    const notifs = await prisma.notification.findMany({
      where: { type: "PROJECT_ARCHIVED", entityId: unclaimedProject.id },
    });
    assert.ok(
      notifs.some((n) => n.userId === moduleHolder.id),
      "an unclaimed project's archive event must fall back to Projects module holders, never silently notify nobody"
    );
  } finally {
    await prisma.notification.deleteMany({ where: { entityId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } }).catch(() => {});
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test("Phase 3B — Invoice status notifications (create non-Draft, transitions, same-status no-op)", async () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  try {
    const owner = await makeUser({ emailSuffix: "invowner", modules: ["Invoices"] });
    createdUserIds.push(owner.id);
    const ownerPayload = asPayload(owner);

    const project = await makeProject({ createdByUserId: owner.id });
    createdProjectIds.push(project.id);

    const quantityItem = await createQuantity(project.id, {
      description: "Test activity",
      woQty: 100,
      uom: "Nos",
      currency: "INR",
      unitRate: 100,
      exchangeRate: 1,
      unitRateINR: 100,
      woValue: 10000,
    } as Parameters<typeof createQuantity>[1]);

    // ---- Draft creation -> NO notification ----
    const draftLine = await createInvoiceLineForQuantityItem(
      quantityItem.id,
      {
        invoiceNo: `${TAG}-INV-1`,
        invoiceDate: new Date("2026-01-15"),
        quantityBilled: 0,
        invoiceAmountINR: 0,
        status: "Draft",
        createdBy: owner.id,
      } as Parameters<typeof createInvoiceLineForQuantityItem>[1],
      ownerPayload
    );
    const draftNotifs = await prisma.notification.findMany({ where: { type: "INVOICE_STATUS_CHANGED", userId: owner.id } });
    assert.equal(draftNotifs.length, 0, "creating a Draft line must never notify");

    // ---- Non-Draft creation -> notifies ----
    const raisedLine = await createInvoiceLineForQuantityItem(
      quantityItem.id,
      {
        invoiceNo: `${TAG}-INV-2`,
        invoiceDate: new Date("2026-01-15"),
        quantityBilled: 10,
        invoiceAmountINR: 1000,
        status: "Raised",
        createdBy: owner.id,
      } as Parameters<typeof createInvoiceLineForQuantityItem>[1],
      ownerPayload
    );
    const createdNotifs = await prisma.notification.findMany({
      where: { type: "INVOICE_STATUS_CHANGED", userId: owner.id, entityId: project.id },
    });
    assert.equal(createdNotifs.length, 1, "creating a non-Draft line must notify exactly once");
    assert.equal(createdNotifs[0]!.severity, "Info");
    assert.equal(createdNotifs[0]!.entityType, "Invoice");
    assert.equal(createdNotifs[0]!.actionUrl, `/projects/edit/${project.id}`, "Invoice actionUrl must resolve via the project route");

    // ---- Same-status PATCH -> NO additional notification ----
    await updateInvoiceLine(raisedLine.id, { status: "Raised" } as Parameters<typeof updateInvoiceLine>[1], ownerPayload);
    const afterSameStatus = await prisma.notification.findMany({
      where: { type: "INVOICE_STATUS_CHANGED", userId: owner.id, entityId: project.id },
    });
    assert.equal(afterSameStatus.length, 1, "Raised -> Raised must not create a second notification");

    // ---- Real transition PATCH -> notifies again (a genuinely different transition, not suppressed) ----
    await updateInvoiceLine(
      raisedLine.id,
      { status: "PartiallyPaid" } as Parameters<typeof updateInvoiceLine>[1],
      ownerPayload
    );
    const afterTransition = await prisma.notification.findMany({
      where: { type: "INVOICE_STATUS_CHANGED", userId: owner.id, entityId: project.id },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(afterTransition.length, 2, "Raised -> PartiallyPaid is a separate legitimate transition and must notify");
    assert.match(afterTransition[1]!.message, /Raised to PartiallyPaid/);

    void draftLine;
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } }).catch(() => {});
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

test("Phase 3B — Keka/Manual timesheet import summary notifications", async () => {
  const createdUserIds: string[] = [];
  try {
    const timesheetUser = await makeUser({ emailSuffix: "tsuser", modules: ["Timesheets"] });
    createdUserIds.push(timesheetUser.id);

    const baseResult: ProcessImportResult = {
      importId: `${TAG}-import-1`,
      status: "Succeeded",
      totalRows: 258,
      createdCount: 14,
      updatedCount: 3,
      unchangedCount: 241,
      removedCount: 0,
      failedCount: 0,
      errorSummary: null,
    };

    await notifyTimesheetImportOutcome(baseResult, "Keka");
    const succeeded = await prisma.notification.findMany({ where: { userId: timesheetUser.id, type: "TIMESHEET_IMPORT_COMPLETED" } });
    assert.equal(succeeded.length, 1);
    assert.equal(succeeded[0]!.title, "Keka Timesheet Import Completed");
    assert.equal(succeeded[0]!.severity, "Info");
    assert.equal(succeeded[0]!.entityType, "TimesheetImport");
    assert.equal(succeeded[0]!.entityId, baseResult.importId);
    assert.match(succeeded[0]!.message, /258 rows processed: 14 created, 3 updated, 241 unchanged\./);

    await notifyTimesheetImportOutcome(
      { ...baseResult, importId: `${TAG}-import-2`, status: "PartiallySucceeded", failedCount: 5 },
      "Manual"
    );
    const partial = await prisma.notification.findMany({ where: { userId: timesheetUser.id, type: "TIMESHEET_IMPORT_PARTIAL" } });
    assert.equal(partial.length, 1);
    assert.equal(partial[0]!.title, "Manual Timesheet Import Partially Completed");
    assert.equal(partial[0]!.severity, "Medium");
    assert.match(partial[0]!.message, /5 row\(s\) failed\./);

    await notifyTimesheetImportOutcome(
      { ...baseResult, importId: `${TAG}-import-3`, status: "Failed", errorSummary: "All 258 rows failed validation." },
      "Keka"
    );
    const failed = await prisma.notification.findMany({ where: { userId: timesheetUser.id, type: "TIMESHEET_IMPORT_FAILED" } });
    assert.equal(failed.length, 1);
    assert.equal(failed[0]!.title, "Keka Timesheet Import Failed");
    assert.equal(failed[0]!.severity, "High");
    assert.equal(failed[0]!.message, "All 258 rows failed validation.");
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
