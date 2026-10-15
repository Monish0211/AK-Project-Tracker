import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { createProjectSchema, importProjectRowSchema } from "../projects/validators/project.validators.js";
import { prRequestProjectDataSchema } from "../prRequests/validators/prRequest.validators.js";

/**
 * PMO Coordinator Management — Phase 3: project access for the assigned
 * coordinator account, the approved Read Only exception ("Option B"),
 * save-time eligibility, revocation, and the registry's email-edit rule.
 *
 * Isolated, tagged @example.com fixtures, all removed in `finally`. No
 * email-capable action is used (Primary PM / status never change, so no
 * project notification fires; tests run with SMTP disabled regardless).
 */

const TAG = `pmoaccess-${Date.now()}`;
const tagLower = TAG.toLowerCase();

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function projectBody(suffix: string, extra: Record<string, unknown> = {}) {
  return {
    poMonth: "2026-10",
    prCategory: "India",
    prNo: `PR-${TAG}-${suffix}`,
    client: "PmoAccess Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: `PmoAccess ${suffix}`,
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01").toISOString(),
    projectStatus: "Active",
    workOrderNumber: `WO-${TAG}-${suffix}`,
    workOrderDate: new Date("2026-01-01").toISOString(),
    rfqNo: "RFQ-TEST",
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "Typed Name",
    ...extra,
  };
}

test("PMO Coordinator — project access, Read Only exception, eligibility, revocation", async (t) => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const importIds: string[] = [];

  try {
    const roles = Object.fromEntries(
      await Promise.all(
        ["Administrator", "Engineer", "Read Only"].map(async (name) => [
          name,
          await prisma.portalRole.findUniqueOrThrow({ where: { name } }),
        ])
      )
    );
    const [settingsModule, projectsModule, invoicesModule, timesheetsModule] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Settings" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Timesheets" } }),
    ]);
    const sensitiveApprovals = await prisma.approvalType.findMany({
      where: { name: { in: ["Archive Projects", "Delete Project Permanently", "Raise Invoice"] } },
      select: { id: true },
    });
    assert.equal(sensitiveApprovals.length, 3, "approval types missing — run the migrations");
    const passwordHash = await hashPassword("PmoAccessTest@123");

    async function makeUser(
      key: string,
      roleName: string,
      opts: { modules?: string[]; approvals?: string[] } = {}
    ) {
      const role = roles[roleName]!;
      const user = await prisma.portalUser.create({
        data: {
          fullName: `PmoAccess ${key}`,
          email: `${TAG}-${key}@example.com`,
          passwordHash,
          department: "PMO",
          roleId: role.id,
          forcePasswordChange: false,
          moduleAccess: { create: (opts.modules ?? []).map((moduleId) => ({ moduleId })) },
          approvalPermissions: { create: (opts.approvals ?? []).map((approvalTypeId) => ({ approvalTypeId })) },
        },
      });
      createdUserIds.push(user.id);
      const token = signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: role.name });
      return { user, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
    }

    const admin = await makeUser("admin", "Administrator", { modules: [settingsModule.id, projectsModule.id] });
    const owner = await makeUser("owner", "Engineer", { modules: [projectsModule.id] });
    const coordEng = await makeUser("coord-eng", "Engineer", { modules: [projectsModule.id] });
    const coordEng2 = await makeUser("coord-eng2", "Engineer", { modules: [projectsModule.id] });
    // Read Only coordinator who ALSO holds every sensitive approval right — to
    // prove the exception never turns those into usable rights.
    // Holds Invoices + Timesheets too, so only the Read Only rule decides those writes.
    const coordRO = await makeUser("coord-ro", "Read Only", {
      modules: [projectsModule.id, invoicesModule.id, timesheetsModule.id],
      approvals: sensitiveApprovals.map((a) => a.id),
    });
    const lockedAcct = await makeUser("locked", "Engineer", { modules: [projectsModule.id] });
    await prisma.portalUser.update({ where: { id: lockedAcct.user.id }, data: { accountLocked: true } });
    const noProjectsUser = await makeUser("noprojects", "Engineer");
    const approvalsModule = await prisma.module.findUniqueOrThrow({ where: { name: "Approvals" } });
    const prUser = await makeUser("pruser", "Engineer", { modules: [approvalsModule.id] });

    const register = async (key: string, email: string) => {
      const res = await fetch(`${url}/pmo-coordinators`, {
        method: "POST",
        headers: admin.headers,
        body: JSON.stringify({ displayName: `PmoAccess Coord ${key}`, email }),
      });
      assert.equal(res.status, 201, key);
      return ((await res.json()) as { data: { id: string } }).data.id;
    };
    const E = {
      eng: await register("eng", `${TAG}-coord-eng@example.com`),
      eng2: await register("eng2", `${TAG}-COORD-ENG2@example.com`),
      ro: await register("ro", `${TAG}-coord-ro@example.com`),
      locked: await register("locked", `${TAG}-locked@example.com`),
      none: await register("none", `${TAG}-nobody@example.com`),
      spare: await register("spare", `${TAG}-spare@example.com`),
    };

    const api = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
      fetch(`${url}${path}`, { method, headers, ...(body !== undefined && { body: JSON.stringify(body) }) });

    const createAsOwner = async (suffix: string, extra: Record<string, unknown> = {}) => {
      const res = await api("POST", "/projects", owner.headers, projectBody(suffix, extra));
      const json = (await res.json()) as { data?: { id: string; pmoCoordinator: string; pmoCoordinatorUserId: string | null; pmoCoordinatorAssignedAt: string | null }; message?: string };
      if (json.data?.id) createdProjectIds.push(json.data.id);
      return { status: res.status, json };
    };

    // P1 → coordEng, P3 → coordRO, P2 → no coordinator account (text only).
    const p1 = await createAsOwner("P1", { pmoCoordinatorEntryId: E.eng });
    const p2 = await createAsOwner("P2");
    const p3 = await createAsOwner("P3", { pmoCoordinatorEntryId: E.ro });
    const P1 = p1.json.data!.id;
    const P2 = p2.json.data!.id;
    const P3 = p3.json.data!.id;
    // A legacy "unclaimed" project (no creator): open to every normal user,
    // but never writable by a Read Only user who doesn't coordinate it.
    const unclaimed = await prisma.project.create({
      data: {
        ...projectBody("UNCLAIMED"),
        projectStartDate: new Date("2026-01-01"),
        workOrderDate: new Date("2026-01-01"),
        createdByUserId: null,
      },
    });
    createdProjectIds.push(unclaimed.id);
    const UNCLAIMED = unclaimed.id;
    const tsImport = await prisma.timesheetImport.create({ data: { triggeredBy: "ManualUpload", totalRows: 0, status: "Succeeded" } });
    importIds.push(tsImport.id);

    await t.test("picker: any Projects user sees names + live eligibility; others denied", async () => {
      assert.equal((await fetch(`${url}/projects/pmo-coordinators`)).status, 401);
      assert.equal((await api("GET", "/projects/pmo-coordinators", noProjectsUser.headers)).status, 403);
      assert.equal((await api("GET", "/projects/pmo-coordinators", prUser.headers)).status, 200, "PR Request form users");
      assert.equal((await api("GET", `/projects/${P1}`, prUser.headers)).status, 403, "picker access is not project access");
      const res = await api("GET", "/projects/pmo-coordinators", coordRO.headers);
      assert.equal(res.status, 200);
      const items = ((await res.json()) as { data: { items: Array<{ id: string; status: string; selectable: boolean; statusMessage: string; accountId: string | null }> } }).data.items;
      const byId = new Map(items.map((i) => [i.id, i]));
      assert.equal(byId.get(E.eng)?.selectable, true);
      assert.equal(byId.get(E.eng)?.accountId, coordEng.user.id);
      assert.equal(byId.get(E.locked)?.status, "locked");
      assert.equal(byId.get(E.locked)?.selectable, false);
      assert.equal(byId.get(E.none)?.status, "no_account");
      assert.match(byId.get(E.none)!.statusMessage, /No PMO Portal account/);
      assert.ok(!("assignedProjectCount" in byId.get(E.eng)!), "picker does not expose registry admin detail");
    });

    await t.test("create: entry links the account; text-only never does", async () => {
      assert.equal(p1.status, 201);
      assert.equal(p1.json.data!.pmoCoordinatorUserId, coordEng.user.id);
      assert.equal(p1.json.data!.pmoCoordinator, "PmoAccess Coord eng", "stored name comes from the registry, not the typed text");
      assert.ok(p1.json.data!.pmoCoordinatorAssignedAt);
      assert.equal(p2.status, 201);
      assert.equal(p2.json.data!.pmoCoordinatorUserId, null);
      assert.equal(p2.json.data!.pmoCoordinator, "Typed Name");

      for (const [entry, re] of [
        [E.locked, /locked/],
        [E.none, /No PMO Portal account/],
        ["no-such-entry", /no longer registered/],
      ] as const) {
        const bad = await createAsOwner(`BAD-${entry.slice(-6)}`, { pmoCoordinatorEntryId: entry });
        assert.equal(bad.status, 400);
        assert.match(bad.json.message!, re);
      }
      assert.equal(await prisma.project.count({ where: { prNo: { startsWith: `PR-${TAG}-BAD` } } }), 0, "rejected create saved nothing");
    });

    await t.test("assigned coordinator: view + edit THIS project only; listed; other projects denied", async () => {
      assert.equal((await api("GET", `/projects/${P1}`, coordEng.headers)).status, 200);
      assert.equal((await api("PATCH", `/projects/${P1}`, coordEng.headers, { projectTitle: "Edited by coordinator" })).status, 200);
      assert.equal((await api("GET", `/projects/${P1}/milestones`, coordEng.headers)).status, 200);
      assert.equal((await api("GET", `/projects/${P2}`, coordEng.headers)).status, 403);
      assert.equal((await api("PATCH", `/projects/${P2}`, coordEng.headers, { projectTitle: "nope" })).status, 403);
      assert.equal((await api("GET", `/projects/${P2}/milestones`, coordEng.headers)).status, 403);

      const list = await api("GET", `/projects?search=${encodeURIComponent(TAG)}&pageSize=50`, coordEng.headers);
      const ids = ((await list.json()) as { data: { items: Array<{ id: string }> } }).data.items.map((i) => i.id);
      assert.ok(ids.includes(P1));
      assert.ok(!ids.includes(P2) && !ids.includes(P3));
    });

    await t.test("coordinator assignment grants no approval rights (archive / permanent delete)", async () => {
      assert.equal((await api("DELETE", `/projects/${P1}`, coordEng.headers)).status, 403);
      assert.equal((await api("DELETE", `/projects/${P1}/permanent`, coordEng.headers)).status, 403);
      assert.ok(await prisma.project.findFirst({ where: { id: P1, isDeleted: false } }));
    });

    await t.test("Read Only coordinator: manages the assigned project's operational data", async () => {
      assert.equal((await api("GET", `/projects/${P3}`, coordRO.headers)).status, 200);
      assert.equal((await api("PATCH", `/projects/${P3}`, coordRO.headers, { projectTitle: "Edited by RO coordinator" })).status, 200);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: P3 } })).projectTitle, "Edited by RO coordinator");
      assert.equal((await api("PATCH", `/projects/${P3}`, coordRO.headers, { pmoCoordinatorEntryId: E.ro })).status, 200, "re-save same coordinator");

      // Quantities: create, edit (delete at the end).
      const q = await api("POST", `/projects/${P3}/quantity`, coordRO.headers, { description: "RO qty", woQty: 5, uom: "DAY", unitRate: 100 });
      assert.equal(q.status, 201);
      const qId = ((await q.json()) as { data: { id: string } }).data.id;
      assert.equal((await api("PATCH", `/quantity/${qId}`, coordRO.headers, { description: "RO qty edited" })).status, 200);

      // Payment milestones.
      const m = await api("POST", `/projects/${P3}/milestones`, coordRO.headers, { milestoneName: "RO milestone", paymentPercentage: 10 });
      assert.equal(m.status, 201);
      const mId = ((await m.json()) as { data: { id: string } }).data.id;
      assert.equal((await api("PATCH", `/milestones/${mId}`, coordRO.headers, { milestoneName: "RO milestone edited" })).status, 200);
      assert.equal((await api("DELETE", `/milestones/${mId}`, coordRO.headers)).status, 200);

      // Other project expenses.
      const e = await api("POST", `/projects/${P3}/expenses`, coordRO.headers, { category: "Travel", description: "RO expense", quantity: 1, unitCost: 50 });
      assert.equal(e.status, 201);
      const eId = ((await e.json()) as { data: { id: string } }).data.id;
      assert.equal((await api("PATCH", `/expenses/${eId}`, coordRO.headers, { description: "RO expense edited" })).status, 200);
      assert.equal((await api("DELETE", `/expenses/${eId}`, coordRO.headers)).status, 200);

      // Notes.
      assert.equal((await api("POST", `/projects/${P3}/notes`, coordRO.headers, { message: "RO coordinator note" })).status, 201);

      // Document upload passes the Read Only gate (an empty upload is then rejected as invalid, not forbidden).
      const upload = await fetch(`${url}/projects/${P3}/documents`, {
        method: "POST",
        headers: { Authorization: coordRO.headers.Authorization! },
        body: new FormData(),
      });
      assert.notEqual(upload.status, 403);

      // A timesheet entry on the assigned project.
      const entry = await prisma.timesheetEntry.create({
        data: {
          employeeNo: `${TAG}-EMP`, projectId: P3, rawProjectCode: `${TAG}-code`, workDate: new Date("2026-03-01"),
          task: "RO probe", hours: 2, firstImportId: tsImport.id, lastImportId: tsImport.id,
        },
      });
      assert.equal((await api("PATCH", `/timesheets/entries/${entry.id}`, coordRO.headers, { hours: 3 })).status, 200);

      assert.equal((await api("DELETE", `/quantity/${qId}`, coordRO.headers)).status, 200);
    });

    await t.test("Read Only coordinator: other projects stay Read Only", async () => {
      assert.equal((await api("PATCH", `/projects/${P1}`, coordRO.headers, { projectTitle: "nope" })).status, 403);
      assert.equal((await api("PATCH", `/projects/${P2}`, coordRO.headers, { projectTitle: "nope" })).status, 403);
      assert.equal((await api("GET", `/projects/${P2}`, coordRO.headers)).status, 403);
      const attempts: Array<[string, Record<string, unknown>]> = [
        [`/projects/${P1}/quantity`, { description: "x", woQty: 1, uom: "DAY", unitRate: 1 }],
        [`/projects/${P1}/milestones`, { milestoneName: "x", paymentPercentage: 1 }],
        [`/projects/${P1}/expenses`, { category: "Travel", description: "x", quantity: 1, unitCost: 1 }],
        [`/projects/${P1}/notes`, { message: "x" }],
        [`/projects/${UNCLAIMED}/notes`, { message: "x" }],
        [`/projects/${UNCLAIMED}/quantity`, { description: "x", woQty: 1, uom: "DAY", unitRate: 1 }],
      ];
      for (const [path, body] of attempts) {
        assert.equal((await api("POST", path, coordRO.headers, body)).status, 403, path);
      }
      const otherEntry = await prisma.timesheetEntry.create({
        data: {
          employeeNo: `${TAG}-EMP`, projectId: P1, rawProjectCode: `${TAG}-code`, workDate: new Date("2026-03-02"),
          task: "other", hours: 2, firstImportId: tsImport.id, lastImportId: tsImport.id,
        },
      });
      assert.equal((await api("PATCH", `/timesheets/entries/${otherEntry.id}`, coordRO.headers, { hours: 3 })).status, 403);
      const unassignedEntry = await prisma.timesheetEntry.create({
        data: {
          employeeNo: `${TAG}-EMP`, projectId: null, rawProjectCode: `${TAG}-code`, workDate: new Date("2026-03-03"),
          task: "unassigned", hours: 2, firstImportId: tsImport.id, lastImportId: tsImport.id,
        },
      });
      assert.equal((await api("PATCH", `/timesheets/entries/${unassignedEntry.id}`, coordRO.headers, { hours: 3 })).status, 403);
    });

    await t.test("Read Only coordinator: lifecycle and finance stay blocked even holding every approval right", async () => {
      assert.equal((await api("DELETE", `/projects/${P3}`, coordRO.headers)).status, 403, "archive");
      assert.equal((await api("DELETE", `/projects/${P3}/permanent`, coordRO.headers)).status, 403, "permanent delete");
      assert.equal((await api("PATCH", `/projects/${P3}/restore`, coordRO.headers)).status, 403, "restore");
      assert.equal((await api("POST", "/projects", coordRO.headers, projectBody("RO-CREATE"))).status, 403, "create");
      assert.equal((await api("POST", "/projects/import", coordRO.headers, { projects: [projectBody("RO-IMP")] })).status, 403, "import");
      const item = await prisma.quantityItem.create({
        data: { projectId: P3, description: "Invoice probe", woQty: 10, uom: "DAY", unitRate: 100, exchangeRate: 1, unitRateINR: 100, woValue: 1000 },
      });
      assert.equal((await api("POST", `/quantity/${item.id}/invoice-lines`, coordRO.headers, { invoiceQty: 1 })).status, 403, "raise invoice");
      assert.equal((await api("POST", `/projects/${P3}/invoice-requests`, coordRO.headers, {})).status, 403, "invoice request");
      assert.equal(await prisma.invoiceLine.count({ where: { quantityItemId: item.id } }), 0);
      assert.ok(await prisma.project.findFirst({ where: { id: P3, isDeleted: false } }));
      const account = await prisma.portalUser.findUniqueOrThrow({ where: { id: coordRO.user.id }, include: { role: true } });
      assert.equal(account.role.name, "Read Only", "assignment never changes the account");
    });

    await t.test("Read Only coordinator cannot hand the coordinator access to someone else", async () => {
      assert.equal((await api("PATCH", `/projects/${P3}`, coordRO.headers, { pmoCoordinatorEntryId: E.eng2 })).status, 403);
      assert.equal((await api("PATCH", `/projects/${P3}`, coordRO.headers, { pmoCoordinator: "Someone Else" })).status, 403);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: P3 } })).pmoCoordinatorUserId, coordRO.user.id);
    });

    await t.test("module access is still required", async () => {
      await prisma.project.update({ where: { id: P2 }, data: { pmoCoordinatorUserId: noProjectsUser.user.id } });
      try {
        assert.equal((await api("GET", `/projects/${P2}`, noProjectsUser.headers)).status, 403);
        assert.equal((await api("PATCH", `/projects/${P2}`, noProjectsUser.headers, { projectTitle: "x" })).status, 403);
      } finally {
        await prisma.project.update({ where: { id: P2 }, data: { pmoCoordinatorUserId: null } });
      }
    });

    await t.test("assignment: ineligible picks rejected, nothing saved; unchanged coordinator not re-checked", async () => {
      const before = await prisma.project.findUniqueOrThrow({ where: { id: P2 } });
      const bad = await api("PATCH", `/projects/${P2}`, admin.headers, { pmoCoordinatorEntryId: E.locked, projectTitle: "should not save" });
      assert.equal(bad.status, 400);
      const after = await prisma.project.findUniqueOrThrow({ where: { id: P2 } });
      assert.equal(after.projectTitle, before.projectTitle, "whole save rejected");
      assert.equal(after.pmoCoordinatorUserId, null);

      // P1's coordinator becomes locked AFTER assignment: editing other fields still works.
      await prisma.portalUser.update({ where: { id: coordEng.user.id }, data: { accountLocked: true } });
      try {
        const res = await api("PATCH", `/projects/${P1}`, admin.headers, { pmoCoordinatorEntryId: E.eng, projectTitle: "Admin edit" });
        assert.equal(res.status, 200);
      } finally {
        await prisma.portalUser.update({ where: { id: coordEng.user.id }, data: { accountLocked: false } });
      }
    });

    await t.test("revocation: reassignment and text-only change remove access immediately", async () => {
      const assignedAt = (await prisma.project.findUniqueOrThrow({ where: { id: P3 } })).pmoCoordinatorAssignedAt!;
      const res = await api("PATCH", `/projects/${P3}`, admin.headers, { pmoCoordinatorEntryId: E.eng2 });
      assert.equal(res.status, 200);
      const row = await prisma.project.findUniqueOrThrow({ where: { id: P3 } });
      assert.equal(row.pmoCoordinatorUserId, coordEng2.user.id);
      assert.equal(row.pmoCoordinator, "PmoAccess Coord eng2");
      assert.ok(row.pmoCoordinatorAssignedAt! > assignedAt, "assigned date moves on change");
      assert.equal((await api("GET", `/projects/${P3}`, coordRO.headers)).status, 403);
      assert.equal((await api("PATCH", `/projects/${P3}`, coordRO.headers, { projectTitle: "x" })).status, 403);
      assert.equal((await api("GET", `/projects/${P3}`, coordEng2.headers)).status, 200);

      // Free-text coordinator change drops the account link (never sets one).
      assert.equal((await api("PATCH", `/projects/${P1}`, admin.headers, { pmoCoordinator: "Some Typed Name" })).status, 200);
      const p1Row = await prisma.project.findUniqueOrThrow({ where: { id: P1 } });
      assert.equal(p1Row.pmoCoordinatorUserId, null);
      assert.equal(p1Row.pmoCoordinatorAssignedAt, null);
      assert.equal((await api("GET", `/projects/${P1}`, coordEng.headers)).status, 403);
      assert.equal((await api("PATCH", `/projects/${P1}`, coordEng.headers, { projectTitle: "x" })).status, 403);
    });

    await t.test("registry: email edit blocked while assigned (active or archived); rename and case-only allowed", async () => {
      // E.eng2 is assigned to P3 (active).
      const blocked = await api("PATCH", `/pmo-coordinators/${E.eng2}`, admin.headers, { email: `${TAG}-moved@example.com` });
      assert.equal(blocked.status, 409);
      assert.match(((await blocked.json()) as { message: string }).message, /1 active project/);
      assert.equal((await api("PATCH", `/pmo-coordinators/${E.eng2}`, admin.headers, { email: `${TAG}-coord-eng2@example.com` })).status, 200, "case-only change");
      assert.equal((await api("PATCH", `/pmo-coordinators/${E.eng2}`, admin.headers, { displayName: "Renamed Coord" })).status, 200);
      // A rename never rewrites existing projects' stored name (it is a snapshot).
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: P3 } })).pmoCoordinator, "PmoAccess Coord eng2");

      await prisma.project.update({ where: { id: P3 }, data: { isDeleted: true } });
      const blockedArchived = await api("PATCH", `/pmo-coordinators/${E.eng2}`, admin.headers, { email: `${TAG}-moved@example.com` });
      assert.equal(blockedArchived.status, 409);
      assert.match(((await blockedArchived.json()) as { message: string }).message, /1 archived project/);
      assert.equal((await api("DELETE", `/pmo-coordinators/${E.eng2}`, admin.headers)).status, 409);
      await prisma.project.update({ where: { id: P3 }, data: { isDeleted: false } });

      // Unassigned entry: email can change; a duplicate is still refused.
      assert.equal((await api("PATCH", `/pmo-coordinators/${E.spare}`, admin.headers, { email: `${TAG}-COORD-ENG@example.com` })).status, 409);
      const moved = await api("PATCH", `/pmo-coordinators/${E.spare}`, admin.headers, { email: `${TAG}-Spare2@Example.com` });
      assert.equal(moved.status, 200);
      assert.equal(((await moved.json()) as { data: { email: string } }).data.email, `${TAG}-Spare2@Example.com`, "kept as typed");
      assert.equal((await api("PATCH", `/pmo-coordinators/${E.spare}`, admin.headers, {})).status, 400);
    });

    await t.test("Excel import stays text-only; a PR Request keeps the registry pick for approval", async () => {
      for (const schema of [createProjectSchema, importProjectRowSchema]) {
        const parsed = schema.parse({ ...projectBody("SCHEMA"), pmoCoordinatorEntryId: E.eng });
        assert.ok(!("pmoCoordinatorEntryId" in parsed));
      }
      // Linked (and re-validated) only when the request is approved — see
      // prRequestCoordinator.http.test.ts for the full flow.
      const pr = prRequestProjectDataSchema.parse({ ...projectBody("SCHEMA-PR"), pmoCoordinatorEntryId: E.eng });
      assert.equal(pr.pmoCoordinatorEntryId, E.eng);

      const res = await api("POST", "/projects/import", owner.headers, {
        projects: [projectBody("IMP", { pmoCoordinatorEntryId: E.eng, pmoCoordinator: "PmoAccess Coord eng" })],
      });
      assert.equal(res.status, 201);
      const imported = await prisma.project.findFirstOrThrow({ where: { prNo: `PR-${TAG}-IMP` } });
      createdProjectIds.push(imported.id);
      assert.equal(imported.pmoCoordinatorUserId, null, "a matching name never grants access");
      assert.equal(imported.pmoCoordinator, "PmoAccess Coord eng");
    });
  } finally {
    await prisma.timesheetEntry.deleteMany({ where: { employeeNo: `${TAG}-EMP` } });
    await prisma.timesheetImport.deleteMany({ where: { id: { in: importIds } } });
    await prisma.projectNote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { prNo: { startsWith: `PR-${TAG}` } } });
    await prisma.pmoCoordinator.deleteMany({ where: { emailNormalized: { startsWith: tagLower } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
