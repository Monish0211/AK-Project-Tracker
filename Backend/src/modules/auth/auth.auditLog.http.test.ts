import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `auth-audit-${Date.now()}`;

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

test("GET /auth/audit-logs — Administrator-only, paginated, newest-first, no sensitive fields, read-only", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdAuditLogIds: string[] = [];

  try {
    const [adminRole, engineerRole] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("AuthAuditTest@123");

    const normalUser = await prisma.portalUser.create({
      data: {
        fullName: "Audit Test Normal User",
        email: `${TAG}-normal@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(normalUser.id);

    const adminUser = await prisma.portalUser.create({
      data: {
        fullName: "Audit Test Administrator",
        email: `${TAG}-admin@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(adminUser.id);

    // Fixtures are stamped strictly in the future, spaced a minute apart —
    // this guarantees they are the newest rows in the whole (shared,
    // real-data) AuthAuditLog table regardless of what else exists or is
    // concurrently written by the running application, making newest-first
    // ordering and pagination assertions deterministic without needing to
    // control or know the table's total row count.
    const base = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 50); // +50 years
    const fixtureEvents = ["AUDIT_TEST_EVENT_1", "AUDIT_TEST_EVENT_2", "AUDIT_TEST_EVENT_3", "AUDIT_TEST_EVENT_4", "AUDIT_TEST_EVENT_5"];
    const fixtures = [];
    for (let i = 0; i < fixtureEvents.length; i++) {
      const row = await prisma.authAuditLog.create({
        data: {
          userId: adminUser.id,
          email: adminUser.email,
          event: fixtureEvents[i]!,
          ipAddress: "10.0.0.1",
          userAgent: "AuditLogHttpTest/1.0",
          createdAt: new Date(base.getTime() + i * 60_000),
        },
      });
      fixtures.push(row);
      createdAuditLogIds.push(row.id);
    }
    // Newest first: EVENT_5 (i=4) has the latest createdAt.
    const newestFirst = [...fixtures].reverse();

    type AuditLogsResponse = {
      success: boolean;
      message?: string;
      data?: {
        items: {
          id: string;
          occurredAt: string;
          event: string;
          email: string;
          userId: string | null;
          userFullName: string | null;
          ipAddress: string | null;
          userAgent: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
      };
    };

    const getAuditLogs = async (token: string | undefined, query = "") => {
      const res = await fetch(`${url}/auth/audit-logs${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return { status: res.status, json: (await res.json()) as AuditLogsResponse };
    };

    // 1. unauthenticated -> 401
    const unauth = await getAuditLogs(undefined);
    assert.equal(unauth.status, 401);

    // 2. normal user -> 403
    const normalRes = await getAuditLogs(tokenFor({ ...normalUser, roleName: engineerRole.name }));
    assert.equal(normalRes.status, 403);

    // 3. Administrator -> 200
    const adminToken = tokenFor({ ...adminUser, roleName: adminRole.name });
    const adminRes = await getAuditLogs(adminToken, "?page=1&pageSize=5");
    assert.equal(adminRes.status, 200);
    assert.equal(adminRes.json.success, true);
    assert.ok(adminRes.json.data);
    assert.equal(adminRes.json.data.page, 1);
    assert.equal(adminRes.json.data.pageSize, 5);
    assert.ok(adminRes.json.data.total >= fixtures.length);

    // 4. newest-first ordering: the 5 newest rows in the whole table are
    // exactly our 5 fixtures, in descending createdAt order.
    const top5 = adminRes.json.data.items;
    assert.equal(top5.length, 5);
    assert.deepEqual(top5.map((r) => r.event), newestFirst.map((f) => f.event));
    assert.deepEqual(top5.map((r) => r.id), newestFirst.map((f) => f.id));
    for (let i = 0; i < top5.length - 1; i++) {
      assert.ok(new Date(top5[i]!.occurredAt).getTime() >= new Date(top5[i + 1]!.occurredAt).getTime());
    }

    // 5. pagination: page 2 with pageSize 2 returns fixtures[2] and fixtures[1] (0-indexed from newest)
    const page2 = await getAuditLogs(adminToken, "?page=2&pageSize=2");
    assert.equal(page2.status, 200);
    assert.deepEqual(
      page2.json.data!.items.map((r) => r.event),
      [newestFirst[2]!.event, newestFirst[3]!.event]
    );

    // 6. response shape carries no sensitive fields (no password/hash/token/secret keys anywhere in the payload)
    const rawBody = JSON.stringify(adminRes.json);
    for (const forbidden of ["passwordHash", "password", "refreshToken", "accessToken", "token", "secret", "vapid"]) {
      assert.equal(rawBody.toLowerCase().includes(forbidden.toLowerCase()), false, `response must not contain "${forbidden}"`);
    }
    // Exact key set per item — proves nothing beyond the documented DTO fields is ever exposed.
    const expectedKeys = ["id", "occurredAt", "event", "email", "userId", "userFullName", "ipAddress", "userAgent"].sort();
    for (const item of top5) {
      assert.deepEqual(Object.keys(item).sort(), expectedKeys);
    }
    // The fixtures' own known values round-trip correctly.
    assert.equal(top5[0]!.email, adminUser.email);
    assert.equal(top5[0]!.userFullName, adminUser.fullName);
    assert.equal(top5[0]!.ipAddress, "10.0.0.1");
    assert.equal(top5[0]!.userAgent, "AuditLogHttpTest/1.0");

    // 7. read-only: no write route is registered for this path.
    const writeAttempt = await fetch(`${url}/auth/audit-logs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(writeAttempt.status, 404);
  } finally {
    if (createdAuditLogIds.length > 0) {
      await prisma.authAuditLog.deleteMany({ where: { id: { in: createdAuditLogIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
