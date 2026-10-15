import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * GET /auth/audit-logs `from` / `to` (Oct 2026): strict dates via
 * dateInput(). Malformed values are a clear 400 (never a database error or a
 * silently-empty page); valid date-only and full-timestamp bounds filter
 * createdAt exactly as before (gte from, lte to). The existing contract has
 * no from <= to rule, so a reversed range stays a valid, empty result.
 * Isolated fixtures are removed in `finally`.
 */

const TAG = `auditdate-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

test("audit-log date filters: strict validation, unchanged range semantics", async (t) => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const logEmail = `${TAG}-subject@example.com`;

  try {
    const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } });
    const admin = await prisma.portalUser.create({
      data: { fullName: "AuditDate Admin", email: `${TAG}-admin@example.com`, passwordHash: await hashPassword("AuditDate@123"), department: "PMO", roleId: role.id, forcePasswordChange: false },
    });
    createdUserIds.push(admin.id);
    const h = { Authorization: `Bearer ${signAccessToken({ sub: admin.id, email: admin.email, roleId: role.id, roleName: role.name })}` };
    for (const [event, at] of [["E10", "2026-01-10T10:00:00.000Z"], ["E15", "2026-01-15T10:00:00.000Z"], ["E20", "2026-01-20T10:00:00.000Z"]] as const) {
      await prisma.authAuditLog.create({ data: { email: logEmail, event, createdAt: new Date(at) } });
    }
    const get = async (q: string) => {
      const res = await fetch(`${url}/auth/audit-logs?email=${encodeURIComponent(logEmail)}&${q}`, { headers: h });
      const json = (await res.json()) as { data?: { items: Array<{ event: string }>; total: number }; message?: string };
      return { status: res.status, events: json.data?.items.map((i) => i.event).sort(), message: json.message };
    };

    await t.test("optional: no bounds returns everything; one bound at a time works", async () => {
      assert.deepEqual((await get("")).events, ["E10", "E15", "E20"]);
      assert.deepEqual((await get("from=2026-01-15")).events, ["E15", "E20"], "date-only from = UTC midnight, gte");
      assert.deepEqual((await get("to=2026-01-15T10:00:00.000Z")).events, ["E10", "E15"], "lte is inclusive");
    });

    await t.test("valid ranges and the frontend's timezone-shifted timestamps filter as before", async () => {
      assert.deepEqual((await get("from=2026-01-12T00:00:00.000Z&to=2026-01-20T23:59:59.999Z")).events, ["E15", "E20"]);
      // What the Settings page sends for "midnight IST" — a full ISO timestamp with Z.
      assert.deepEqual((await get(`from=${encodeURIComponent("2026-01-14T18:30:00.000Z")}`)).events, ["E15", "E20"]);
      assert.deepEqual((await get(`from=${encodeURIComponent("2026-01-15T05:30:00+05:30")}`)).events, ["E15", "E20"], "offset timestamps keep their instant");
    });

    await t.test("malformed, five-digit-year and impossible dates are a clear 400", async () => {
      for (const [q, field] of [
        ["from=20226-01-01", "from"],
        [`from=${encodeURIComponent("+020226-01-01T00:00:00.000Z")}`, "from"],
        ["to=2026-02-30", "to"],
        ["from=not-a-date", "from"],
        ["to=2026-13-01T00:00:00Z", "to"],
      ] as const) {
        const res = await get(q);
        assert.equal(res.status, 400, q);
        assert.match(res.message!, new RegExp(`^${field}: (From|To) date must be a valid date`), q);
      }
    });

    await t.test("reversed range keeps the existing contract: valid request, empty result", async () => {
      const res = await get("from=2026-01-20&to=2026-01-10");
      assert.equal(res.status, 200);
      assert.deepEqual(res.events, []);
    });
  } finally {
    await close();
    await prisma.authAuditLog.deleteMany({ where: { email: { startsWith: TAG } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
