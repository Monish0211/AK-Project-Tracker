import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { invoiceEditDeleteGrants } from "./invoiceApprovalGrants.testutil.js";

/**
 * Manual invoice numbering (Oct 2026) — users enter their Tally invoice
 * number; it must be unique across the WHOLE portal, compared ignoring
 * letter case and outer whitespace, and a new invoice can never reopen,
 * overwrite or merge into an existing one (Cancelled included). Isolated,
 * tagged test data, cleaned up in `finally`.
 */

const TAG = `invnum-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

interface LineDto {
  id: string;
  invoiceNo: string;
  status: string;
}

test("Manual invoice numbering — validation, portal-wide uniqueness, no merge, release on delete", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [role, invoicesModule, projectsModule, raiseInvoice] = await Promise.all([
      prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
      prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
      prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } }),
    ]);
    const user = await prisma.portalUser.create({
      data: {
        fullName: "InvNum Raiser",
        email: `${TAG}@example.com`,
        passwordHash: await hashPassword("InvNumTest@123"),
        department: "Accounts",
        roleId: role.id,
        forcePasswordChange: false,
        moduleAccess: { create: [{ moduleId: projectsModule.id }, { moduleId: invoicesModule.id }] },
        approvalPermissions: { create: [{ approvalTypeId: raiseInvoice.id }, ...(await invoiceEditDeleteGrants())] },
      },
    });
    createdUserIds.push(user.id);
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: role.name })}`,
    };

    let seq = 0;
    async function makeProject(itemCount = 2) {
      seq += 1;
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-PR-${seq}`, client: "InvNum Client", department: "Process",
          domesticForeign: "Domestic", projectTitle: `Invoice number regression ${seq}`, workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId: null,
        },
      });
      createdProjectIds.push(project.id);
      const items = [];
      for (let i = 0; i < itemCount; i += 1) {
        items.push(await prisma.quantityItem.create({
          data: { projectId: project.id, description: `Item ${i + 1}`, woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 },
        }));
      }
      return { project, items };
    }
    const create = (qid: string, invoiceNo: string, extra: Record<string, unknown> = {}) =>
      fetch(`${url}/quantity/${qid}/invoice-lines`, {
        method: "POST", headers,
        body: JSON.stringify({ invoiceNo, invoiceDate: new Date("2026-03-01").toISOString(), quantityBilled: 0, invoiceAmountINR: 1000, status: "Draft", ...extra }),
      });
    const patch = (id: string, body: Record<string, unknown>) => fetch(`${url}/invoice-lines/${id}`, { method: "PATCH", headers, body: JSON.stringify(body) });
    const del = (id: string) => fetch(`${url}/invoice-lines/${id}`, { method: "DELETE", headers });
    const data = async (res: Response) => ((await res.json()) as { data: LineDto }).data;
    const registered = (invoiceNo: string) => prisma.invoiceNumber.findUnique({ where: { normalizedInvoiceNo: invoiceNo.trim().toUpperCase() } });
    const available = async (projectId: string, invoiceNo: string) => {
      const res = await fetch(`${url}/projects/${projectId}/invoice-numbers/availability?invoiceNo=${encodeURIComponent(invoiceNo)}`, { headers });
      return { status: res.status, body: res.status === 200 ? ((await res.json()) as { data: { available: boolean; usedInThisProject: boolean } }).data : null };
    };

    const a = await makeProject();
    const b = await makeProject();
    const NO = `INV/${TAG}/24-25/0001`;

    // 1. Blank / whitespace-only numbers are rejected; outer whitespace is trimmed, the rest kept exactly.
    assert.equal((await create(a.items[0]!.id, "", { invoiceIntent: "new" })).status, 400);
    assert.equal((await create(a.items[0]!.id, "    ", { invoiceIntent: "new" })).status, 400);
    const first = await create(a.items[0]!.id, `  ${NO}  `, { invoiceIntent: "new" });
    assert.equal(first.status, 201);
    const firstLine = await data(first);
    assert.equal(firstLine.invoiceNo, NO, "outer whitespace trimmed, number otherwise exactly as entered");
    assert.equal((await registered(NO))?.projectId, a.project.id);

    // 1b. No fixed maximum length: long Tally numbers are stored exactly; only a
    // value past the database's physical index limit gets a clear 400 (nothing written).
    for (const len of [17, 101, 500]) {
      const longNo = `${TAG}/${"Ab9-".repeat(Math.ceil(len / 4))}`.slice(0, Math.max(len, TAG.length + 2));
      const res = await create(b.items[1]!.id, longNo, { invoiceIntent: "new" });
      assert.equal(res.status, 201, `length ${longNo.length} accepted`);
      const line = await data(res);
      assert.equal(line.invoiceNo, longNo, "long number stored exactly as entered");
      assert.equal((await del(line.id)).status, 200);
    }
    const hugeNo = Array.from({ length: 6000 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 34)]).join("");
    const hugeRes = await create(b.items[1]!.id, hugeNo, { invoiceIntent: "new" });
    assert.equal(hugeRes.status, 400, "past the database ceiling: clear 400, not a 500");
    assert.match(((await hugeRes.json()) as { message: string }).message, /too long/);
    assert.equal(await prisma.invoiceLine.count({ where: { quantityItemId: b.items[1]!.id } }), 0, "nothing written");

    // 2. A second line of the SAME invoice (another activity) joins it.
    assert.equal((await create(a.items[1]!.id, NO, { invoiceIntent: "existing" })).status, 201);

    // 3. A NEW invoice can never reuse it: same project, letter-case variant, or another project.
    assert.equal((await create(a.items[1]!.id, NO, { invoiceIntent: "new" })).status, 409, "same project, new invoice -> no merge");
    assert.equal((await create(a.items[1]!.id, NO.toLowerCase(), { invoiceIntent: "new" })).status, 409, "case-insensitive");
    assert.equal((await create(b.items[0]!.id, NO, { invoiceIntent: "new" })).status, 409, "portal-wide");
    assert.equal((await create(b.items[0]!.id, NO)).status, 409, "a caller without an intent still cannot use another project's number");
    assert.equal((await create(b.items[0]!.id, NO, { invoiceIntent: "existing" })).status, 409);
    assert.equal((await create(a.items[0]!.id, NO.toLowerCase(), { invoiceIntent: "existing" })).status, 409, "joining requires the exact spelling");

    // 4. "existing" for a number this project doesn't have is rejected (no silent creation).
    assert.equal((await create(a.items[0]!.id, `${TAG}-NOPE`, { invoiceIntent: "existing" })).status, 409);

    // 5. Every status keeps the number reserved — a Cancelled invoice's number is never reused automatically.
    for (const status of ["Raised", "PartiallyPaid", "Paid", "Cancelled"]) {
      assert.equal((await patch(firstLine.id, { status })).status, 200, `status ${status}`);
    }
    assert.equal((await create(b.items[0]!.id, NO, { invoiceIntent: "new" })).status, 409, "cancelled number still reserved (other project)");
    assert.equal((await create(a.items[0]!.id, NO, { invoiceIntent: "new" })).status, 409, "cancelled number still reserved (same project)");

    // 6. Availability check (what the form asks before closing).
    assert.deepEqual((await available(a.project.id, NO)).body, { invoiceNo: NO, available: false, usedInThisProject: true });
    assert.deepEqual((await available(b.project.id, ` ${NO.toLowerCase()} `)).body, { invoiceNo: NO.toLowerCase(), available: false, usedInThisProject: false });
    assert.equal((await available(b.project.id, `${TAG}-FREE`)).body?.available, true);
    assert.equal((await available(b.project.id, "   ")).status, 400);

    // 7. Deleting ONE line keeps the number; deleting the LAST line releases it for reuse.
    const two = `${TAG}-TWO`;
    const t1 = await data(await create(b.items[0]!.id, two, { invoiceIntent: "new" }));
    const t2 = await data(await create(b.items[1]!.id, two, { invoiceIntent: "existing" }));
    assert.equal((await del(t1.id)).status, 200);
    assert.ok(await registered(two), "another line still carries the number -> reserved");
    assert.equal((await del(t2.id)).status, 200);
    assert.equal(await registered(two), null, "invoice fully deleted -> number released");
    assert.equal((await create(a.items[0]!.id, two, { invoiceIntent: "new" })).status, 201, "a released number can be entered again");

    // 8. PATCH: unchanged full-payload resend is fine; rename to a free number moves the registration;
    //    rename into an existing invoice (merge) or a case-only change is rejected.
    const r = await data(await create(b.items[0]!.id, `${TAG}-R1`, { invoiceIntent: "new" }));
    assert.equal((await patch(r.id, { invoiceNo: `${TAG}-R1`, remarks: "resend" })).status, 200);
    assert.equal((await patch(r.id, { invoiceNo: NO })).status, 409, "cannot rename into another invoice's number");
    assert.equal((await patch(r.id, { invoiceNo: `${TAG}-r1` })).status, 400, "case-only rename rejected");
    assert.equal((await patch(r.id, { invoiceNo: "   " })).status, 400, "blank rename rejected");
    assert.equal((await patch(r.id, { invoiceNo: `${TAG}-R2` })).status, 200);
    assert.equal(await registered(`${TAG}-R1`), null, "old number released");
    assert.equal((await registered(`${TAG}-R2`))?.projectId, b.project.id);
    const unchanged = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: r.id } });
    assert.equal(unchanged.invoiceNo, `${TAG}-R2`);

    // 9. A failed create leaves no registration behind (all-or-nothing): Work Order Value ceiling breach.
    const big = await create(a.items[0]!.id, `${TAG}-TOO-BIG`, { invoiceIntent: "new", invoiceAmountINR: 99_000_000 });
    assert.equal(big.status, 400);
    assert.equal(await registered(`${TAG}-TOO-BIG`), null, "rejected create rolled back its number claim");

    // 10. Legacy callers (no intent) keep working: new number registers, same-project number joins.
    const legacyNo = `${TAG}-LEGACY`;
    assert.equal((await create(a.items[0]!.id, legacyNo)).status, 201);
    assert.equal((await create(a.items[1]!.id, legacyNo)).status, 201, "legacy join of this project's own invoice");

    // 11. Concurrency: the same new number submitted simultaneously from two projects -> exactly one wins.
    for (let round = 0; round < 3; round += 1) {
      const raceNo = `${TAG}-RACE-${round}`;
      const results = await Promise.all([
        create(a.items[0]!.id, raceNo, { invoiceIntent: "new" }),
        create(b.items[0]!.id, raceNo, { invoiceIntent: "new" }),
        create(b.items[1]!.id, raceNo.toLowerCase(), { invoiceIntent: "new" }),
      ]);
      const statuses = results.map((res) => res.status).sort();
      assert.deepEqual(statuses, [201, 409, 409], `round ${round}: exactly one claim succeeds`);
      const lines = await prisma.invoiceLine.findMany({ where: { invoiceNo: { in: [raceNo, raceNo.toLowerCase()] } } });
      assert.equal(lines.length, 1, `round ${round}: losers wrote nothing`);
      assert.equal(await prisma.invoiceNumber.count({ where: { normalizedInvoiceNo: raceNo.toUpperCase() } }), 1);
    }
  } finally {
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: createdProjectIds } } } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
