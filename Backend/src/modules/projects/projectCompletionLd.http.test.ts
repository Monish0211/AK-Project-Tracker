import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Project completion + Liquidated Damages (Oct 2026) through the real
 * routes: PATCH /projects/:id (complete), POST /projects (create as
 * Completed), GET /projects[/:id] (LD + server expense totals). Covers
 * validation, immutability, session-derived recorded-by, permissions,
 * concurrent completions, reopen, legacy "not recorded" projects and the
 * server-side audit note.
 */

const TAG = `ld-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const userIds: string[] = [];
const projectIds: string[] = [];
const tokens: Record<string, string> = {};
let ownerId = "";
let otherId = "";
let prSeq = 0;

const REMARKS = "All deliverables handed over and accepted by client.";

async function api(method: string, path: string, who: string, body?: unknown, raw?: string) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Record<string, unknown>; message?: string };
  return { status: res.status, data: json.data as Record<string, any> | undefined, message: json.message };
}

async function newProject(overrides: Record<string, unknown> = {}) {
  const prNo = `PR-${TAG}-${++prSeq}`;
  const row = await prisma.project.create({
    data: {
      poMonth: "2026-10",
      prCategory: "India",
      prNo,
      rfqNo: "RFQ-LD",
      client: "LD Client",
      department: "Process",
      domesticForeign: "Domestic",
      projectTitle: "LD probe",
      workOrderStatus: "Received",
      projectStartDate: new Date("2026-01-01"),
      projectStatus: "Active",
      workOrderNumber: `${prNo}-WO`,
      workOrderDate: new Date("2026-01-01"),
      eicName: "EIC",
      contractType: "LUMP SUM",
      pmoCoordinator: "PMO",
      createdByUserId: ownerId,
      ...overrides,
    },
  });
  projectIds.push(row.id);
  return row;
}

const complete = (extra: Record<string, unknown>) => ({ projectStatus: "Completed", actualCompletionDate: "2026-10-01", completionRemarks: REMARKS, ...extra });

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  const [projectsModule, engineerRole, readOnlyRole] = await Promise.all([
    prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Read Only" } }),
  ]);
  const passwordHash = await hashPassword("LdTest@123");
  const mk = async (key: string, roleId: string, roleName: string, withProjects: boolean) => {
    const u = await prisma.portalUser.create({
      data: {
        fullName: `LD ${key}`,
        email: `${TAG}-${key}@example.com`,
        passwordHash,
        department: "PMO",
        roleId,
        forcePasswordChange: false,
        ...(withProjects ? { moduleAccess: { create: { moduleId: projectsModule.id } } } : {}),
      },
    });
    userIds.push(u.id);
    tokens[key] = signAccessToken({ sub: u.id, email: u.email, roleId, roleName });
    return u.id;
  };
  ownerId = await mk("owner", engineerRole.id, engineerRole.name, true);
  otherId = await mk("other", engineerRole.id, engineerRole.name, true);
  await mk("readonly", readOnlyRole.id, readOnlyRole.name, true);
  await mk("nomodule", engineerRole.id, engineerRole.name, false);
});

after(async () => {
  try {
    if (projectIds.length > 0) {
      await prisma.projectNote.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.projectExpense.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.projectResource.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    if (userIds.length > 0) {
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
    }
  } finally {
    await closeServer();
  }
});

test("complete with LD = No: recorded as No, no amount, recorded-by from the session, audit note written", async () => {
  const p = await newProject();
  const r = await api("PATCH", `/projects/${p.id}`, "owner", complete({ ldApplicable: false, ldRecordedByUserId: otherId, ldRecordedAt: "2020-01-01" }));
  assert.equal(r.status, 200, r.message);
  assert.equal(r.data!.projectStatus, "Completed");
  assert.equal(r.data!.ldApplicable, false);
  assert.equal(r.data!.ldAmountINR, null);
  assert.equal(r.data!.ldRecordedByUserId, ownerId, "a browser-supplied recorded-by is ignored");
  assert.ok(Date.now() - new Date(r.data!.ldRecordedAt).getTime() < 60_000, "recorded-at is server time, not the supplied value");
  const notes = await prisma.projectNote.findMany({ where: { projectId: p.id } });
  assert.equal(notes.length, 1);
  assert.match(notes[0].message, /^PROJECT COMPLETED\n/);
  assert.match(notes[0].message, /Liquidated Damages: Not applicable/);
  assert.match(notes[0].message, /Completed By: LD owner/);
  assert.equal(notes[0].createdBy, "LD owner");
});

test("complete with LD = Yes: exact 2-decimal amount and optional reference stored", async () => {
  const p = await newProject();
  const r = await api("PATCH", `/projects/${p.id}`, "owner", complete({ ldApplicable: true, ldAmountINR: 50000.5, ldRemarks: "  Clause 14.2 letter  " }));
  assert.equal(r.status, 200, r.message);
  assert.equal(r.data!.ldApplicable, true);
  assert.equal(r.data!.ldAmountINR, 50000.5);
  assert.equal(r.data!.ldRemarks, "Clause 14.2 letter");
  const stored = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(stored.ldAmountINR!.toString(), "50000.5", "Decimal(14,2) stores the exact amount");
  const note = await prisma.projectNote.findFirstOrThrow({ where: { projectId: p.id } });
  assert.match(note.message, /Applicable — ₹ 50,000\.50/);
  assert.match(note.message, /LD Reference \/ Remarks: Clause 14\.2 letter/);
});

test("invalid completion and LD input is rejected and nothing is written", async () => {
  const p = await newProject();
  const cases: [string, Record<string, unknown> | string, number, RegExp][] = [
    ["no LD decision", complete({}), 400, /choose whether/],
    ["Yes without amount", complete({ ldApplicable: true }), 400, /required when LD is applicable/],
    ["zero", complete({ ldApplicable: true, ldAmountINR: 0 }), 400, /greater than zero/],
    ["negative", complete({ ldApplicable: true, ldAmountINR: -100 }), 400, /greater than zero/],
    ["three decimals", complete({ ldApplicable: true, ldAmountINR: 10.123 }), 400, /two decimal/],
    ["too large", complete({ ldApplicable: true, ldAmountINR: 1e12 }), 400, /too large/],
    ["string amount", complete({ ldApplicable: true, ldAmountINR: "5000" }), 400, /./],
    ["amount while No", complete({ ldApplicable: false, ldAmountINR: 10 }), 400, /only be given when LD is applicable/],
    ["missing date", complete({ actualCompletionDate: null, ldApplicable: false }), 400, /Actual Completion Date/],
    ["short remarks", complete({ completionRemarks: "too short", ldApplicable: false }), 400, /at least 20 characters/],
    [
      "Infinity (1e400 in raw JSON)",
      `{"projectStatus":"Completed","actualCompletionDate":"2026-10-01","completionRemarks":"${REMARKS}","ldApplicable":true,"ldAmountINR":1e400}`,
      400,
      /./,
    ],
  ];
  for (const [label, body, status, re] of cases) {
    const r = typeof body === "string" ? await api("PATCH", `/projects/${p.id}`, "owner", undefined, body) : await api("PATCH", `/projects/${p.id}`, "owner", body);
    assert.equal(r.status, status, `${label}: ${r.message}`);
    assert.match(r.message ?? "", re, label);
  }
  const stored = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(stored.projectStatus, "Active", "no partial write");
  assert.equal(stored.ldApplicable, null);
  assert.equal(await prisma.projectNote.count({ where: { projectId: p.id } }), 0);
});

test("LD cannot be changed after completion; identical re-submits are harmless; other edits still work", async () => {
  const p = await newProject();
  assert.equal((await api("PATCH", `/projects/${p.id}`, "owner", complete({ ldApplicable: true, ldAmountINR: 75000 }))).status, 200);
  const change = await api("PATCH", `/projects/${p.id}`, "owner", { ldAmountINR: 1 });
  assert.equal(change.status, 409);
  assert.match(change.message!, /already recorded/);
  assert.equal((await api("PATCH", `/projects/${p.id}`, "owner", { ldApplicable: false })).status, 409);
  const same = await api("PATCH", `/projects/${p.id}`, "owner", { projectStatus: "Completed", ldApplicable: true, ldAmountINR: 75000, projectTitle: "Renamed" });
  assert.equal(same.status, 200, "same values re-sent with an ordinary save");
  assert.equal(same.data!.projectTitle, "Renamed");
  assert.equal(same.data!.ldAmountINR, 75000);
  assert.equal(await prisma.projectNote.count({ where: { projectId: p.id } }), 1, "no second completion note for an ordinary save");
});

test("permissions: Read Only, no Projects module and no project access cannot complete or record LD", async () => {
  const p = await newProject();
  for (const who of ["readonly", "nomodule", "other"]) {
    const r = await api("PATCH", `/projects/${p.id}`, who, complete({ ldApplicable: true, ldAmountINR: 100 }));
    assert.ok(r.status === 403 || r.status === 404, `${who}: ${r.status}`);
  }
  const stored = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(stored.projectStatus, "Active");
  assert.equal(stored.ldApplicable, null);
});

test("concurrent completions: exactly one succeeds, one LD value and one audit note", async () => {
  const p = await newProject();
  const results = await Promise.all([
    api("PATCH", `/projects/${p.id}`, "owner", complete({ ldApplicable: true, ldAmountINR: 1000 })),
    api("PATCH", `/projects/${p.id}`, "owner", complete({ ldApplicable: true, ldAmountINR: 2000 })),
    api("PATCH", `/projects/${p.id}`, "owner", complete({ ldApplicable: false })),
  ]);
  const ok = results.filter((r) => r.status === 200);
  assert.equal(ok.length, 1, results.map((r) => `${r.status} ${r.message ?? ""}`).join(" | "));
  assert.ok(results.filter((r) => r.status !== 200).every((r) => r.status === 409));
  const stored = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(stored.ldApplicable, ok[0].data!.ldApplicable);
  assert.equal(stored.ldAmountINR === null ? null : Number(stored.ldAmountINR), ok[0].data!.ldAmountINR);
  assert.equal(await prisma.projectNote.count({ where: { projectId: p.id } }), 1);
});

test("reopening keeps LD; completing again does not ask for or change it", async () => {
  const p = await newProject();
  await api("PATCH", `/projects/${p.id}`, "owner", complete({ ldApplicable: true, ldAmountINR: 12345.67 }));
  const reopened = await api("PATCH", `/projects/${p.id}`, "owner", { projectStatus: "Active" });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.data!.ldApplicable, true);
  assert.equal(reopened.data!.ldAmountINR, 12345.67, "reopen keeps the contractual deduction");
  const again = await api("PATCH", `/projects/${p.id}`, "owner", { projectStatus: "Completed", actualCompletionDate: "2026-10-05", completionRemarks: REMARKS });
  assert.equal(again.status, 200, again.message);
  assert.equal(again.data!.ldAmountINR, 12345.67);
  const notes = await prisma.projectNote.findMany({ where: { projectId: p.id }, orderBy: { createdAt: "asc" } });
  assert.equal(notes.length, 2);
  assert.match(notes[1].message, /recorded earlier, unchanged/);
});

test("legacy completed projects stay Not recorded and LD cannot be added outside a completion", async () => {
  const legacy = await newProject({ projectStatus: "Completed", actualCompletionDate: new Date("2026-05-01"), completionRemarks: REMARKS });
  const got = await api("GET", `/projects/${legacy.id}`, "owner");
  assert.equal(got.data!.ldApplicable, null, "never backfilled as No");
  assert.equal((await api("PATCH", `/projects/${legacy.id}`, "owner", { ldApplicable: false })).status, 400);
  assert.equal((await api("PATCH", `/projects/${legacy.id}`, "owner", { projectTitle: "Legacy edit" })).status, 200, "ordinary edits unaffected");
  const active = await newProject();
  assert.equal((await api("PATCH", `/projects/${active.id}`, "owner", { ldApplicable: true, ldAmountINR: 5 })).status, 400, "no LD without completing");
});

test("POST /projects as Completed follows the same rules", async () => {
  const body = (extra: Record<string, unknown>) => ({
    poMonth: "2026-10",
    prCategory: "India",
    prNo: `PR-${TAG}-c${++prSeq}`,
    client: "LD Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Created completed",
    workOrderStatus: "Received",
    projectStartDate: "2026-01-01",
    projectStatus: "Completed",
    workOrderNumber: "WO-LD",
    workOrderDate: "2026-01-01",
    rfqNo: "RFQ-LD",
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    actualCompletionDate: "2026-09-30",
    completionRemarks: REMARKS,
    ...extra,
  });
  const missing = await api("POST", "/projects", "owner", body({}));
  assert.equal(missing.status, 400);
  const created = await api("POST", "/projects", "owner", body({ ldApplicable: true, ldAmountINR: 2500 }));
  assert.equal(created.status, 201, created.message);
  projectIds.push(created.data!.id);
  assert.equal(created.data!.ldAmountINR, 2500);
  assert.equal(created.data!.ldRecordedByUserId, ownerId);
  assert.equal(await prisma.projectNote.count({ where: { projectId: created.data!.id } }), 1);
  const active = await api("POST", "/projects", "owner", { ...body({}), projectStatus: "Active", actualCompletionDate: undefined, completionRemarks: undefined });
  assert.equal(active.status, 201, "non-completed creates are unaffected");
  projectIds.push(active.data!.id);
  assert.equal(active.data!.ldApplicable, null);
});

test("list and detail carry server-authoritative expense totals (active expenses only)", async () => {
  const p = await newProject({ projectTitle: `${TAG} totals` });
  await prisma.projectResource.createMany({
    data: [
      { projectId: p.id, employeeNo: `${TAG}-E1`, assignmentStatus: "Active", hourlyRateSnapshot: 1500, workingDays: 1, totalHours: 120, manhourCost: 180000 },
      { projectId: p.id, employeeNo: `${TAG}-E2`, assignmentStatus: "Completed", hourlyRateSnapshot: 1000, workingDays: 1, totalHours: 40.5, manhourCost: 40500 },
    ],
  });
  await prisma.projectExpense.createMany({
    data: [
      { projectId: p.id, category: "Travel", description: "a", quantity: 2, unitCost: 12500, totalCost: 25000 },
      { projectId: p.id, category: "Software", description: "b", quantity: 1, unitCost: 54500.5, totalCost: 54500.5 },
      { projectId: p.id, category: "Old", description: "superseded", quantity: 1, unitCost: 999, totalCost: 999, isActive: false },
    ],
  });
  const detail = await api("GET", `/projects/${p.id}`, "owner");
  assert.equal(detail.data!.manhourCostINR, 220500);
  assert.equal(detail.data!.nonManhourCostINR, 79500.5);
  const list = await api("GET", `/projects?page=1&pageSize=50&search=${encodeURIComponent(`${TAG} totals`)}`, "owner");
  const row = (list.data!.items as Record<string, unknown>[]).find((r) => r.id === p.id)!;
  assert.equal(row.manhourCostINR, 220500);
  assert.equal(row.nonManhourCostINR, 79500.5);
});
