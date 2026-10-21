import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { updateLine } from "./repository/invoice.repository.js";
import { findEventsForLines } from "./repository/invoiceStatusEvent.repository.js";

/**
 * Invoice Tracker (Oct 2026) — persistent invoice status history. Every invoice-line write path records an
 * InvoiceStatusEvent in the same transaction, with the authenticated actor and DATABASE time; unchanged statuses
 * record nothing; history survives deletion of the line and even of the project; invoices that predate the table
 * simply have no events. Isolated, tagged data; no email path is reachable (no invoice request exists, SMTP is off).
 */

const TAG = `ise-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const userIds: string[] = [];
const projectIds: string[] = [];
const people: Record<string, { id: string; name: string; headers: Record<string, string> }> = {};
let projectId = "";
let itemA = "";
let itemB = "";

async function api(method: string, path: string, who: string, body?: unknown) {
  const res = await fetch(`${url}${path}`, { method, headers: people[who]!.headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
}

const lineBody = (suffix: string, status: string, extra: Record<string, unknown> = {}) => ({
  invoiceNo: `${TAG}-${suffix}`, invoiceIntent: "new", invoiceDate: "2026-03-01", quantityBilled: 0, invoiceAmountINR: 1000, status, ...extra,
});
const resend = (line: any, overrides: Record<string, unknown> = {}) => ({
  invoiceNo: line.invoiceNo, invoiceDate: String(line.invoiceDate).slice(0, 10), milestoneId: null, milestoneName: null, setIndex: null, description: null,
  quantityBilled: line.quantityBilled, invoiceAmountINR: line.invoiceAmountINR, clientReference: null, remarks: line.remarks ?? null, status: line.status, createdBy: "ignored", ...overrides,
});
const create = async (who: string, suffix: string, status: string, itemId = itemA) => {
  const res = await api("POST", `/quantity/${itemId}/invoice-lines`, who, lineBody(suffix, status));
  assert.equal(res.status, 201, `create ${suffix}: ${res.message}`);
  return res.data;
};
const events = (lineId: string) => prisma.invoiceStatusEvent.findMany({ where: { invoiceLineId: lineId }, orderBy: [{ occurredAt: "asc" }, { seq: "asc" }] });
const dbNow = async () => ((await prisma.$queryRaw<{ t: Date }[]>`SELECT clock_timestamp() AS t`)[0]!.t);

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  const [engineer, adminRole, invoicesM, projectsM, raise, edit, del, permDel] = await Promise.all([
    prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
    prisma.portalRole.findFirstOrThrow({ where: { name: "Administrator" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Edit Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Delete Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Delete Project Permanently" } }),
  ]);
  const passwordHash = await hashPassword("IseTest@123");
  const make = async (key: string, role: { id: string; name: string }, approvals: string[]) => {
    const email = `${TAG}-${key}@example.com`;
    const u = await prisma.portalUser.create({
      data: {
        fullName: `Ise ${key}`, email, passwordHash, department: "Accounts", roleId: role.id, forcePasswordChange: false,
        moduleAccess: { create: [projectsM.id, invoicesM.id].map((moduleId) => ({ moduleId })) },
        approvalPermissions: { create: approvals.map((approvalTypeId) => ({ approvalTypeId })) },
      },
    });
    userIds.push(u.id);
    people[key] = { id: u.id, name: u.fullName, headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: u.id, email, roleId: role.id, roleName: role.name })}` } };
  };
  await make("raiser", engineer, [raise.id, edit.id, del.id]);
  await make("second", engineer, [raise.id, edit.id, del.id]);
  await make("noRaise", engineer, [edit.id]);
  await make("admin", adminRole, [raise.id, edit.id, del.id, permDel.id]);

  const mkProject = async (suffix: string) => {
    const p = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-${suffix}`, client: "Ise Client", department: "Process", domesticForeign: "Domestic",
        projectTitle: `Ise ${suffix}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId: null,
      },
    });
    projectIds.push(p.id);
    const qi = async (d: string) => (await prisma.quantityItem.create({ data: { projectId: p.id, description: d, woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 } })).id;
    return { id: p.id, qi };
  };
  const main = await mkProject("PR");
  projectId = main.id;
  itemA = await main.qi("A");
  itemB = await main.qi("B");
});

after(async () => {
  try {
    await prisma.invoiceStatusEvent.deleteMany({ where: { prNo: { startsWith: TAG } } });
    const items = await prisma.quantityItem.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItemId: { in: items.map((i) => i.id) } } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await closeServer();
  }
});

test("create records one CREATED event: authenticated actor, snapshots, database time, server-side source", async () => {
  const t0 = await dbNow();
  const line = await create("raiser", "L1", "Raised");
  const t1 = await dbNow();
  const ev = await events(line.id);
  assert.equal(ev.length, 1);
  const e = ev[0]!;
  assert.deepEqual([e.eventType, e.fromStatus, e.toStatus, e.source], ["CREATED", null, "Raised", "invoice_create"]);
  assert.deepEqual([e.actorUserId, e.actorName], [people.raiser!.id, "Ise raiser"]);
  assert.deepEqual([e.projectId, e.prNo, e.invoiceNo], [projectId, `${TAG}-PR`, `${TAG}-L1`]);
  assert.ok(e.occurredAt >= t0 && e.occurredAt <= t1, "occurredAt is database time, within the request window (exact instant, no timezone shift)");
});

test("status changes chain correctly with the right actor each time; unchanged status and content-only edits record nothing", async () => {
  const line = await create("raiser", "L2", "Raised");
  assert.equal((await api("PATCH", `/invoice-lines/${line.id}`, "second", resend(line, { status: "PartiallyPaid", createdBy: "Mallory" }))).status, 200);
  assert.equal((await api("PATCH", `/invoice-lines/${line.id}`, "raiser", resend({ ...line, status: "PartiallyPaid" }, { status: "Paid" }))).status, 200);
  const ev = await events(line.id);
  assert.deepEqual(ev.map((e) => [e.eventType, e.fromStatus, e.toStatus, e.actorName]), [
    ["CREATED", null, "Raised", "Ise raiser"],
    ["STATUS_CHANGED", "Raised", "PartiallyPaid", "Ise second"],
    ["STATUS_CHANGED", "PartiallyPaid", "Paid", "Ise raiser"],
  ]);
  assert.ok(ev.every((e, i) => i === 0 || (e.occurredAt >= ev[i - 1]!.occurredAt && e.seq > ev[i - 1]!.seq)), "chronological and strictly ordered");
  assert.ok(!ev.some((e) => e.actorName === "Mallory"), "the actor is never taken from the request body");

  const before = (await events(line.id)).length;
  assert.equal((await api("PATCH", `/invoice-lines/${line.id}`, "raiser", resend({ ...line, status: "Paid" }))).status, 200, "unchanged re-send");
  assert.equal((await api("PATCH", `/invoice-lines/${line.id}`, "raiser", resend({ ...line, status: "Paid" }, { remarks: "only a remark" }))).status, 200, "content-only edit");
  assert.equal((await events(line.id)).length, before, "no event when the status did not change");
});

test("a rejected write records nothing, and the event rolls back with its write", async () => {
  const line = await create("raiser", "L3", "Draft");
  const res = await api("PATCH", `/invoice-lines/${line.id}`, "noRaise", resend(line, { status: "Raised" }));
  assert.equal(res.status, 403, "raising without Raise Invoice is refused");
  assert.equal((await events(line.id)).length, 1, "only the CREATED event");

  // Atomicity: the status update and its event live in one transaction — if the caller's transaction fails, both vanish.
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await updateLine(line.id, { status: "Raised" }, { actorUserId: people.raiser!.id, actorName: "Ise raiser", source: "invoice_update" }, tx);
      assert.equal((await tx.invoiceStatusEvent.count({ where: { invoiceLineId: line.id } })), 2, "visible inside the transaction");
      throw new Error("force rollback");
    }),
    /force rollback/
  );
  assert.equal((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).status, "Draft");
  assert.equal((await events(line.id)).length, 1, "rolled back together with the status change");
});

test("duplicate and concurrent status submissions leave one consistent event chain", async () => {
  const dup = await create("raiser", "L4", "Raised");
  const same = await Promise.all([1, 2, 3].map(() => api("PATCH", `/invoice-lines/${dup.id}`, "raiser", resend(dup, { status: "PartiallyPaid" }))));
  assert.ok(same.every((r) => r.status === 200));
  assert.equal((await events(dup.id)).filter((e) => e.eventType === "STATUS_CHANGED").length, 1, "three identical submissions record one transition");

  const race = await create("raiser", "L5", "Raised");
  const targets = ["Paid", "Cancelled", "PartiallyPaid", "Paid"];
  await Promise.all(targets.map((status, i) => api("PATCH", `/invoice-lines/${race.id}`, i % 2 ? "second" : "raiser", resend(race, { status }))));
  const ev = await events(race.id);
  const final = (await prisma.invoiceLine.findUniqueOrThrow({ where: { id: race.id } })).status;
  ev.forEach((e, i) => i > 0 && assert.equal(e.fromStatus, ev[i - 1]!.toStatus, "every event starts where the previous one ended"));
  assert.equal(ev.at(-1)!.toStatus, final, "the last event matches the stored status");
});

test("delete records DELETED and the history survives the line; deleting a missing line still 404s", async () => {
  const line = await create("raiser", "L6", "Raised");
  await api("PATCH", `/invoice-lines/${line.id}`, "raiser", resend(line, { status: "Paid" }));
  assert.equal((await api("DELETE", `/invoice-lines/${line.id}`, "second")).status, 200);
  assert.equal(await prisma.invoiceLine.findUnique({ where: { id: line.id } }), null);
  const ev = await events(line.id);
  assert.deepEqual(ev.map((e) => [e.eventType, e.fromStatus, e.toStatus, e.actorName, e.source]), [
    ["CREATED", null, "Raised", "Ise raiser", "invoice_create"],
    ["STATUS_CHANGED", "Raised", "Paid", "Ise raiser", "invoice_update"],
    ["DELETED", "Paid", null, "Ise second", "invoice_delete"],
  ]);
  assert.equal((await api("DELETE", `/invoice-lines/${line.id}`, "second")).status, 404);
  assert.equal((await events(line.id)).length, 3, "no event for a failed delete");
});

test("clearing Cancelled lines when an activity is deleted records one DELETED event per line", async () => {
  const a = await create("raiser", "L7a", "Cancelled", itemB);
  const b = await create("raiser", "L7b", "Cancelled", itemB);
  assert.equal((await api("DELETE", `/quantity/${itemB}`, "raiser")).status, 200);
  for (const line of [a, b]) {
    const ev = await events(line.id);
    assert.deepEqual(ev.map((e) => [e.eventType, e.fromStatus, e.toStatus, e.source]), [
      ["CREATED", null, "Cancelled", "invoice_create"],
      ["DELETED", "Cancelled", null, "quantity_activity_delete"],
    ]);
    assert.equal(ev[1]!.actorUserId, people.raiser!.id);
  }
  itemB = ""; // deleted
});

test("ingest records IMPORTED events (earlier history unknown), attributed to the importing administrator; re-ingest adds none", async () => {
  const lines = ["PartiallyPaid", "Paid"].map((status, i) => ({
    id: randomUUID(), quantityItemId: itemA, invoiceNo: `${TAG}-ING${i}`, invoiceDate: "2026-02-01", quantityBilled: 0, invoiceAmountINR: 500, status, createdBy: "Legacy Browser User",
  }));
  const first = await api("POST", `/projects/${projectId}/invoice-items/ingest`, "admin", { lines });
  assert.equal(first.status, 201, first.message);
  for (const [i, l] of lines.entries()) {
    const ev = await events(l.id);
    assert.deepEqual(ev.map((e) => [e.eventType, e.fromStatus, e.toStatus, e.source, e.actorName]), [["IMPORTED", null, l.status, "invoice_ingest", "Ise admin"]], `line ${i}`);
  }
  assert.ok([201, 200].includes((await api("POST", `/projects/${projectId}/invoice-items/ingest`, "admin", { lines })).status));
  for (const l of lines) assert.equal((await events(l.id)).length, 1, "idempotent re-ingest creates no duplicate event");
});

test("permanent project delete records DELETED for each invoice line and keeps the history (no cascade)", async () => {
  const p = await prisma.project.create({
    data: { poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-PERM`, client: "Ise Client", department: "Process", domesticForeign: "Domestic", projectTitle: "Ise perm", workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId: null },
  });
  projectIds.push(p.id);
  const q = await prisma.quantityItem.create({ data: { projectId: p.id, description: "P", woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 } });
  const l1 = await create("raiser", "P1", "Raised", q.id);
  const l2 = await create("raiser", "P2", "Draft", q.id);
  assert.equal((await api("DELETE", `/projects/${p.id}/permanent`, "admin")).status, 200);
  assert.equal(await prisma.project.findUnique({ where: { id: p.id } }), null);
  assert.equal(await prisma.invoiceLine.count({ where: { id: { in: [l1.id, l2.id] } } }), 0);
  for (const [line, status] of [[l1, "Raised"], [l2, "Draft"]] as const) {
    const ev = await events(line.id);
    assert.deepEqual(ev.map((e) => [e.eventType, e.toStatus]), [["CREATED", status], ["DELETED", null]]);
    assert.deepEqual([ev[1]!.source, ev[1]!.actorName, ev[1]!.prNo, ev[1]!.projectId], ["project_permanent_delete", "Ise admin", `${TAG}-PERM`, p.id]);
  }
});

test("invoices that predate the history table have no events — nothing is inferred", async () => {
  const legacy = await prisma.invoiceLine.create({
    data: { quantityItemId: itemA, invoiceNo: `${TAG}-LEGACY`, invoiceDate: new Date("2026-01-10"), quantityBilled: 0, invoiceAmountINR: 100, status: "Paid", createdBy: "Old Entry", createdAt: new Date("2026-01-11") },
  });
  assert.deepEqual(await findEventsForLines([legacy.id]), []);
  assert.deepEqual(await findEventsForLines([]), []);
  // The first recorded change still knows the REAL previous status (read under the lock).
  const res = await api("PATCH", `/invoice-lines/${legacy.id}`, "raiser", resend(legacy, { status: "Cancelled", invoiceDate: "2026-01-10" }));
  assert.equal(res.status, 200, res.message);
  const ev = await events(legacy.id);
  assert.deepEqual(ev.map((e) => [e.eventType, e.fromStatus, e.toStatus]), [["STATUS_CHANGED", "Paid", "Cancelled"]]);
});

test("no code writes invoice lines outside the recorded paths (source scan)", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
        const text = readFileSync(full, "utf8");
        const writes = /invoiceLine\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\b|(UPDATE|INSERT INTO|DELETE FROM)\s+"?InvoiceLine"?/i.test(text);
        const allowed = full.replace(/\\/g, "/").endsWith("invoices/repository/invoice.repository.ts") || full.replace(/\\/g, "/").endsWith("projects/repository/project.repository.ts");
        if (writes && !allowed) offenders.push(full);
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], "invoice-line writes must go through invoice.repository.ts (which records history)");
  const project = readFileSync(join(root, "modules/projects/repository/project.repository.ts"), "utf8");
  assert.match(project, /recordProjectInvoiceDeletionEvents\(id, audit\),\s*prisma\.invoiceLine\.deleteMany/, "permanent delete records events before deleting lines");
});
