import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { PR_CATEGORY_PREFIX_MAP } from "./project.constants.js";

/**
 * Regional Liquidated Damages (Phase 4 final) through the real routes. A project's own currency decides what its LD is: India stays INR exactly
 * as before; Malaysia, Oman, Abu Dhabi, FZE, Elixir Qatar and Qatar record theirs in MYR / OMR / AED / AED / QAR / QAR. The server decides the
 * currency from the stored country, so a spoofed or mismatching currency is refused and changes nothing. Historical rupee records stay as they are.
 */
const TAG = `ldr-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const userIds: string[] = [];
const projectIds: string[] = [];
let token = "";
let ownerId = "";
let prSeq = 0;
const REMARKS = "All deliverables handed over and accepted by client.";

const COUNTRIES: Array<{ category: keyof typeof PR_CATEGORY_PREFIX_MAP; currency: string }> = [
  { category: "India", currency: "INR" },
  { category: "Malaysia", currency: "MYR" },
  { category: "Oman", currency: "OMR" },
  { category: "Abu Dhabi", currency: "AED" },
  { category: "FZI", currency: "AED" },
  { category: "Elixir Qatar", currency: "QAR" },
  { category: "Qatar", currency: "QAR" },
];

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: Record<string, any>; message?: string };
  return { status: res.status, data: json.data, message: json.message };
}

async function newProject(category: string, currency: string | null, overrides: Record<string, unknown> = {}) {
  const prNo = `${PR_CATEGORY_PREFIX_MAP[category as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}-${++prSeq}`;
  const row = await prisma.project.create({
    data: {
      poMonth: "2026-11",
      prCategory: category,
      regionalCurrency: currency,
      prNo,
      rfqNo: "RFQ-LD",
      client: "LD Regional Client",
      department: "Process",
      domesticForeign: "Domestic",
      projectTitle: "LD regional probe",
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

const complete = (extra: Record<string, unknown>) => ({ projectStatus: "Completed", actualCompletionDate: "2026-11-10", completionRemarks: REMARKS, ...extra });

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  const [projectsModule, addProjectModule, role] = await Promise.all([
    prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Add Project" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
  ]);
  const u = await prisma.portalUser.create({
    data: {
      fullName: "LD Regional owner",
      email: `${TAG}-owner@example.com`,
      passwordHash: await hashPassword("LdTest@123"),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      moduleAccess: { create: [{ moduleId: projectsModule.id }, { moduleId: addProjectModule.id }] },
    },
  });
  userIds.push(u.id);
  ownerId = u.id;
  token = signAccessToken({ sub: u.id, email: u.email, roleId: role.id, roleName: role.name });
});

after(async () => {
  try {
    if (projectIds.length > 0) {
      await prisma.projectNote.deleteMany({ where: { projectId: { in: projectIds } } });
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

test("each of the seven countries records its LD in its own currency, in the right column, and reads it back", async () => {
  for (const { category, currency } of COUNTRIES) {
    const p = await newProject(category, currency);
    // No currency is sent: the server decides it from the project's country.
    const done = await api("PATCH", `/projects/${p.id}`, complete({ ldApplicable: true, ldAmount: 1250.5, ldRemarks: "Clause 9" }));
    assert.equal(done.status, 200, `${category}: ${done.message}`);
    assert.equal(done.data!.ldCurrency, currency, category);
    if (currency === "INR") {
      assert.equal(done.data!.ldAmountINR, 1250.5, "India keeps the original INR column");
      assert.equal(done.data!.ldAmountRegional, null);
    } else {
      assert.equal(done.data!.ldAmountRegional, 1250.5, `${category} regional column`);
      assert.equal(done.data!.ldAmountINR, null, `${category}: no rupee figure is invented`);
    }
    const row = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(row.ldCurrency, currency);
    assert.equal(Number(currency === "INR" ? row.ldAmountINR : row.ldAmountRegional), 1250.5);
    const read = await api("GET", `/projects/${p.id}`);
    assert.equal(read.data!.ldCurrency, currency);
    assert.equal(read.data!.ldApplicable, true);
    const note = await prisma.projectNote.findFirstOrThrow({ where: { projectId: p.id } });
    assert.match(note.message, currency === "INR" ? /Applicable — ₹ 1,250\.50/ : new RegExp(`Applicable — ${currency} 1,250\\.50`));
    if (currency !== "INR") assert.doesNotMatch(note.message, /₹/);
  }
});

test("OMR keeps its three decimals exactly; other regional currencies refuse a third decimal", async () => {
  const oman = await newProject("Oman", "OMR");
  const ok = await api("PATCH", `/projects/${oman.id}`, complete({ ldApplicable: true, ldAmount: 123.456 }));
  assert.equal(ok.status, 200, ok.message);
  assert.equal(ok.data!.ldAmountRegional, 123.456);
  const abu = await newProject("Abu Dhabi", "AED");
  const bad = await api("PATCH", `/projects/${abu.id}`, complete({ ldApplicable: true, ldAmount: 123.456 }));
  assert.equal(bad.status, 400);
  assert.match(bad.message ?? "", /two decimal/);
});

test("India: the original ldAmountINR field still works unchanged and records INR", async () => {
  for (const stored of [null, "INR"]) {
    const p = await newProject("India", stored);
    const done = await api("PATCH", `/projects/${p.id}`, complete({ ldApplicable: true, ldAmountINR: 50000, ldRemarks: "Clause 14" }));
    assert.equal(done.status, 200, done.message);
    assert.equal(done.data!.ldAmountINR, 50000);
    assert.equal(done.data!.ldCurrency, "INR");
    assert.equal(done.data!.ldAmountRegional, null);
  }
});

test("a mismatching currency or a rupee amount on a regional project is refused and nothing is recorded", async () => {
  for (const { category, currency } of COUNTRIES.filter((c) => c.currency !== "INR")) {
    const p = await newProject(category, currency);
    const spoof = await api("PATCH", `/projects/${p.id}`, complete({ ldApplicable: true, ldAmount: 5000, ldCurrency: "INR" }));
    assert.equal(spoof.status, 400, `${category} spoofed INR`);
    assert.match(spoof.message ?? "", new RegExp(`must be entered in ${currency}, not INR`));
    const rupee = await api("PATCH", `/projects/${p.id}`, complete({ ldApplicable: true, ldAmountINR: 5000 }));
    assert.equal(rupee.status, 400, `${category} rupee amount`);
    const row = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(row.ldApplicable, null, `${category}: nothing recorded`);
    assert.equal(row.projectStatus, "Active", `${category}: the completion did not go through`);
  }
  const india = await newProject("India", "INR");
  const wrong = await api("PATCH", `/projects/${india.id}`, complete({ ldApplicable: true, ldAmount: 5000, ldCurrency: "AED" }));
  assert.equal(wrong.status, 400);
});

test("a recorded regional LD is immutable: same values pass, a different amount, currency or rupee figure is 409", async () => {
  const p = await newProject("Abu Dhabi", "AED");
  const first = await api("PATCH", `/projects/${p.id}`, complete({ ldApplicable: true, ldAmount: 2500, ldRemarks: "Clause 9" }));
  assert.equal(first.status, 200, first.message);
  const same = await api("PATCH", `/projects/${p.id}`, { ldApplicable: true, ldAmount: 2500, ldCurrency: "AED", ldRemarks: "Clause 9" });
  assert.equal(same.status, 200, same.message);
  for (const change of [{ ldAmount: 2600 }, { ldAmount: 2500, ldCurrency: "OMR" }, { ldAmountINR: 2500 }]) {
    const r = await api("PATCH", `/projects/${p.id}`, change);
    assert.ok(r.status === 409 || r.status === 400, `${JSON.stringify(change)} -> ${r.status}`);
  }
  const row = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(Number(row.ldAmountRegional), 2500);
  assert.equal(row.ldCurrency, "AED");
});

test("a LEGACY rupee LD on a regional project is left exactly as it was and is read as legacy (no currency), never as regional", async () => {
  const p = await newProject("Oman", "OMR", {
    projectStatus: "Completed",
    actualCompletionDate: new Date("2026-11-01"),
    completionRemarks: REMARKS,
    ldApplicable: true,
    ldAmountINR: 5000,
  });
  const read = await api("GET", `/projects/${p.id}`);
  assert.equal(read.data!.ldCurrency, null);
  assert.equal(read.data!.ldAmountINR, 5000);
  assert.equal(read.data!.ldAmountRegional, null);
  // An ordinary edit does not touch it, and the same number sent as an OMR amount is NOT accepted as the same record.
  const edit = await api("PATCH", `/projects/${p.id}`, { remarks: "unrelated edit" });
  assert.equal(edit.status, 200, edit.message);
  const reinterpret = await api("PATCH", `/projects/${p.id}`, { ldAmount: 5000 });
  assert.ok(reinterpret.status === 409 || reinterpret.status === 400, String(reinterpret.status));
  const row = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(Number(row.ldAmountINR), 5000);
  assert.equal(row.ldCurrency, null);
  assert.equal(row.ldAmountRegional, null);
});

test("'No LD' and not-recorded stay distinct and carry no currency or amount", async () => {
  const none = await newProject("Malaysia", "MYR");
  const done = await api("PATCH", `/projects/${none.id}`, complete({ ldApplicable: false }));
  assert.equal(done.status, 200, done.message);
  assert.equal(done.data!.ldApplicable, false);
  assert.equal(done.data!.ldCurrency, null);
  assert.equal(done.data!.ldAmountRegional, null);
  const bad = await newProject("Malaysia", "MYR");
  const withAmount = await api("PATCH", `/projects/${bad.id}`, complete({ ldApplicable: false, ldAmount: 10 }));
  assert.equal(withAmount.status, 400);
  const notRecorded = await newProject("Qatar", "QAR", { projectStatus: "Completed", actualCompletionDate: new Date("2026-11-01"), completionRemarks: REMARKS });
  const read = await api("GET", `/projects/${notRecorded.id}`);
  assert.equal(read.data!.ldApplicable, null);
  assert.equal(read.data!.ldCurrency, null);
});

test("creating a project directly as Completed records its LD in the project's currency", async () => {
  for (const { category, currency } of [COUNTRIES[0]!, COUNTRIES[2]!, COUNTRIES[4]!]) {
    const body = {
      poMonth: "2026-11",
      prCategory: category,
      prNo: `${PR_CATEGORY_PREFIX_MAP[category]}${TAG}-c${++prSeq}`,
      client: "LD Regional Client",
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
      actualCompletionDate: "2026-11-05",
      completionRemarks: REMARKS,
    };
    const rupee = currency !== "INR" ? await api("POST", "/projects", { ...body, ldApplicable: true, ldAmountINR: 2500 }) : null;
    if (rupee) assert.equal(rupee.status, 400, `${category}: a rupee amount on a regional create`);
    const created = await api("POST", "/projects", { ...body, ldApplicable: true, ldAmount: 2500 });
    assert.equal(created.status, 201, `${category}: ${created.message}`);
    projectIds.push(created.data!.id);
    assert.equal(created.data!.ldCurrency, currency);
    assert.equal(currency === "INR" ? created.data!.ldAmountINR : created.data!.ldAmountRegional, 2500);
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Historical LD classification report (read-only)
// ---------------------------------------------------------------------------------------------------------------------------------------------
import { classifyLd } from "./services/ldReview.service.js";

const REVIEW_ROW = { prNo: "X", prCategory: "Oman", projectStatus: "Completed", ldApplicable: true, ldAmountINR: null, ldAmountRegional: null, ldCurrency: null };

test("classification: legacy rupee LD on a regional project needs review and is never reinterpreted; consistent records need nothing", () => {
  const legacyOman = classifyLd({ ...REVIEW_ROW, regionalCurrency: "OMR", ldAmountINR: 5000 }, "Oman");
  assert.equal(legacyOman.reviewStatus, "NEEDS_REVIEW");
  assert.equal(legacyOman.existingAmount, "₹ 5,000.00");
  assert.match(legacyOman.existingInterpretation, /NOT assumed to be an amount in OMR/);
  assert.match(legacyOman.proposedTreatment, /not deducted from OMR profit/);

  const indiaLegacy = classifyLd({ ...REVIEW_ROW, prCategory: "India", regionalCurrency: null, ldAmountINR: 50000 }, "India");
  assert.equal(indiaLegacy.reviewStatus, "CONSISTENT");
  const indiaNew = classifyLd({ ...REVIEW_ROW, prCategory: "India", regionalCurrency: "INR", ldCurrency: "INR", ldAmountINR: 50000 }, "India");
  assert.equal(indiaNew.reviewStatus, "CONSISTENT");

  const regional = classifyLd({ ...REVIEW_ROW, prCategory: "Abu Dhabi", regionalCurrency: "AED", ldCurrency: "AED", ldAmountRegional: 2500 }, "Abu Dhabi");
  assert.equal(regional.reviewStatus, "CONSISTENT");
  assert.equal(regional.existingAmount, "AED 2,500.00");

  const wrongCurrency = classifyLd({ ...REVIEW_ROW, prCategory: "Abu Dhabi", regionalCurrency: "AED", ldCurrency: "QAR", ldAmountRegional: 2500 }, "Abu Dhabi");
  assert.equal(wrongCurrency.reviewStatus, "NEEDS_REVIEW");

  assert.equal(classifyLd({ ...REVIEW_ROW, regionalCurrency: "OMR", ldApplicable: false }, "Oman").reviewStatus, "NO_ACTION");
  const notRecorded = classifyLd({ ...REVIEW_ROW, regionalCurrency: "OMR", ldApplicable: null }, "Oman");
  assert.equal(notRecorded.reviewStatus, "NO_ACTION");
  assert.match(notRecorded.existingInterpretation, /Not read as 'No LD'/);
});

test("GET /projects/liquidated-damages/review: Administrator / PMO Manager only, lists the records, and writes nothing", async () => {
  const legacy = await newProject("Oman", "OMR", { projectStatus: "Completed", actualCompletionDate: new Date("2026-11-01"), completionRemarks: REMARKS, ldApplicable: true, ldAmountINR: 5000 });
  const engineer = await api("GET", "/projects/liquidated-damages/review");
  assert.equal(engineer.status, 403, "an Engineer cannot read the review");

  const [projectsModule, adminRole] = await Promise.all([prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }), prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } })]);
  const admin = await prisma.portalUser.create({
    data: { fullName: "LD Regional admin", email: `${TAG}-admin@example.com`, passwordHash: await hashPassword("LdTest@123"), department: "PMO", roleId: adminRole.id, forcePasswordChange: false, moduleAccess: { create: [{ moduleId: projectsModule.id }] } },
  });
  userIds.push(admin.id);
  const saved = token;
  token = signAccessToken({ sub: admin.id, email: admin.email, roleId: adminRole.id, roleName: adminRole.name });
  try {
    const before = await prisma.project.findUniqueOrThrow({ where: { id: legacy.id } });
    const res = await api("GET", "/projects/liquidated-damages/review");
    assert.equal(res.status, 200, res.message);
    const rows = res.data!.rows as Array<Record<string, any>>;
    const mine = rows.find((r) => r.prNo === legacy.prNo)!;
    assert.equal(mine.reviewStatus, "NEEDS_REVIEW");
    assert.equal(mine.projectCurrency, "OMR");
    assert.equal(mine.existingAmount, "₹ 5,000.00");
    assert.equal(res.data!.summary.total, rows.length);
    assert.equal(res.data!.summary.needsReview + res.data!.summary.consistent + res.data!.summary.noAction, rows.length);
    const after = await prisma.project.findUniqueOrThrow({ where: { id: legacy.id } });
    assert.deepEqual(after, before, "the report changed nothing");
  } finally {
    token = saved;
  }
});

test("saving the edit form on a completed regional project re-sends its LD: a legacy rupee record and a regional record both pass unchanged", async () => {
  const legacy = await newProject("Oman", "OMR", { projectStatus: "Completed", actualCompletionDate: new Date("2026-11-01"), completionRemarks: REMARKS, ldApplicable: true, ldAmountINR: 5000, ldRemarks: "Ref 7" });
  const save = await api("PATCH", `/projects/${legacy.id}`, { projectTitle: "renamed", ldApplicable: true, ldAmountINR: 5000, ldRemarks: "Ref 7" });
  assert.equal(save.status, 200, save.message);
  assert.equal(save.data!.ldAmountINR, 5000);
  assert.equal(save.data!.ldCurrency, null);
  const changed = await api("PATCH", `/projects/${legacy.id}`, { ldApplicable: true, ldAmountINR: 5001 });
  assert.equal(changed.status, 409);

  const abu = await newProject("Abu Dhabi", "AED");
  assert.equal((await api("PATCH", `/projects/${abu.id}`, complete({ ldApplicable: true, ldAmount: 2500, ldRemarks: "Ref 8" }))).status, 200);
  const resave = await api("PATCH", `/projects/${abu.id}`, { projectTitle: "renamed", ldApplicable: true, ldAmount: 2500, ldCurrency: "AED", ldRemarks: "Ref 8" });
  assert.equal(resave.status, 200, resave.message);
  assert.equal(resave.data!.ldAmountRegional, 2500);
});
