import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Settings → PMO Coordinators registry API: Administrator/PMO Manager +
 * Settings module only; duplicate prevention by normalized email; every
 * eligibility status computed live from (fixture) accounts; removal blocked
 * while any project — archived included — is assigned to the entry's account.
 *
 * Isolated, tagged @example.com fixtures, all removed in `finally`. The
 * registry API itself never creates or changes a PortalUser (asserted). No
 * email-capable action is used.
 */

const TAG = `pmocoord-${Date.now()}`;
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

type Item = {
  id: string;
  displayName: string;
  email: string;
  status: string;
  reasons: string[];
  account: { id: string; fullName: string } | null;
  matchingAccountCount: number;
  assignedProjectCount: number;
};

test("PMO Coordinator registry — permissions, duplicates, eligibility, removal", async (t) => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const roles = Object.fromEntries(
      await Promise.all(
        ["Administrator", "PMO Manager", "Engineer", "Read Only"].map(async (name) => [
          name,
          await prisma.portalRole.findUniqueOrThrow({ where: { name } }),
        ])
      )
    );
    const [settingsModule, projectsModule] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Settings" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    ]);
    const passwordHash = await hashPassword("PmoCoordTest@123");

    async function makeUser(
      key: string,
      roleName: string,
      opts: { email?: string; modules?: string[]; isActive?: boolean; accountLocked?: boolean } = {}
    ) {
      const role = roles[roleName]!;
      const user = await prisma.portalUser.create({
        data: {
          fullName: `PmoCoord Test ${key}`,
          email: opts.email ?? `${TAG}-${key}@example.com`,
          passwordHash,
          department: "PMO",
          roleId: role.id,
          forcePasswordChange: false,
          isActive: opts.isActive ?? true,
          accountLocked: opts.accountLocked ?? false,
          moduleAccess: { create: (opts.modules ?? []).map((moduleId) => ({ moduleId })) },
        },
      });
      createdUserIds.push(user.id);
      const token = signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: role.name });
      return { user, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
    }

    // Callers
    const admin = await makeUser("admin", "Administrator", { modules: [settingsModule.id] });
    const pmoManager = await makeUser("pmomgr", "PMO Manager", { modules: [settingsModule.id] });
    const adminNoSettings = await makeUser("admin-nosettings", "Administrator");
    const engineer = await makeUser("engineer", "Engineer", { modules: [settingsModule.id, projectsModule.id] });
    const readOnly = await makeUser("readonly", "Read Only", { modules: [settingsModule.id, projectsModule.id] });

    // Coordinator accounts, one per status
    const eligible = await makeUser("elig", "Engineer", { modules: [projectsModule.id] });
    await makeUser("inactive", "Engineer", { modules: [projectsModule.id], isActive: false });
    await makeUser("locked", "Engineer", { modules: [projectsModule.id], accountLocked: true });
    await makeUser("nomodule", "Engineer");
    await makeUser("amb-lower", "Engineer", { email: `${TAG}-amb@example.com`, modules: [projectsModule.id] });
    await makeUser("amb-upper", "Engineer", { email: `${TAG}-AMB@example.com`, modules: [projectsModule.id] });

    const seededBefore = await prisma.pmoCoordinator.findMany({
      where: { createdByUserId: null },
      orderBy: { id: "asc" },
    });
    const portalUserCountBefore = await prisma.portalUser.count({ where: { email: { startsWith: TAG, mode: "insensitive" } } });

    const post = (h: Record<string, string>, body: unknown) =>
      fetch(`${url}/pmo-coordinators`, { method: "POST", headers: h, body: JSON.stringify(body) });
    const list = async (h: Record<string, string>) => {
      const res = await fetch(`${url}/pmo-coordinators`, { headers: h });
      assert.equal(res.status, 200);
      const json = (await res.json()) as { data: { items: Item[] } };
      return json.data.items.filter((i) => i.email.toLowerCase().includes(tagLower));
    };

    const ids: Record<string, string> = {};

    await t.test("permissions: only Administrator / PMO Manager with the Settings module", async () => {
      const unauth = await fetch(`${url}/pmo-coordinators`);
      assert.equal(unauth.status, 401);

      for (const caller of [adminNoSettings, engineer, readOnly]) {
        assert.equal((await fetch(`${url}/pmo-coordinators`, { headers: caller.headers })).status, 403);
        assert.equal((await post(caller.headers, { displayName: "X", email: `${TAG}-x@example.com` })).status, 403);
      }
      assert.equal((await fetch(`${url}/pmo-coordinators`, { headers: admin.headers })).status, 200);
      assert.equal((await fetch(`${url}/pmo-coordinators`, { headers: pmoManager.headers })).status, 200);
    });

    await t.test("add: exact email kept (trimmed only); entries without an account are allowed", async () => {
      const cases: Array<[string, string, Record<string, string>]> = [
        ["elig", `  ${TAG}-ELIG@Example.com `, admin.headers],
        ["inactive", `${TAG}-inactive@example.com`, admin.headers],
        ["locked", `${TAG}-locked@example.com`, pmoManager.headers],
        ["nomodule", `${TAG}-nomodule@example.com`, pmoManager.headers],
        ["amb", `${TAG}-amb@example.com`, admin.headers],
        ["noaccount", `${TAG}-nobody@example.com`, admin.headers],
      ];
      for (const [key, email, headers] of cases) {
        const res = await post(headers, { displayName: `PmoCoord ${key}`, email });
        assert.equal(res.status, 201, key);
        const json = (await res.json()) as { data: Item };
        ids[key] = json.data.id;
        assert.equal(json.data.email, email.trim(), "case preserved, only surrounding spaces removed");
      }
      const row = await prisma.pmoCoordinator.findUniqueOrThrow({ where: { id: ids.elig! } });
      assert.equal(row.emailNormalized, `${tagLower}-elig@example.com`);
      assert.equal(row.createdByUserId, admin.user.id);
      assert.equal(await prisma.portalUser.count({ where: { email: { startsWith: TAG, mode: "insensitive" } } }), portalUserCountBefore, "registry never creates accounts");
    });

    await t.test("eligibility: every status is computed from the live account", async () => {
      const items = await list(admin.headers);
      const byId = new Map(items.map((i) => [i.id, i]));
      assert.equal(byId.get(ids.elig!)?.status, "eligible");
      assert.equal(byId.get(ids.elig!)?.account?.id, eligible.user.id);
      assert.equal(byId.get(ids.inactive!)?.status, "inactive");
      assert.equal(byId.get(ids.locked!)?.status, "locked");
      assert.equal(byId.get(ids.nomodule!)?.status, "no_projects_module");
      assert.equal(byId.get(ids.amb!)?.status, "ambiguous_account");
      assert.equal(byId.get(ids.amb!)?.matchingAccountCount, 2);
      assert.equal(byId.get(ids.amb!)?.account, null);
      assert.equal(byId.get(ids.noaccount!)?.status, "no_account");
      assert.equal(byId.get(ids.noaccount!)?.account, null);
    });

    await t.test("eligibility is live: a later account change is reflected with no registry edit", async () => {
      await prisma.portalUser.update({ where: { id: eligible.user.id }, data: { accountLocked: true } });
      try {
        const item = (await list(admin.headers)).find((i) => i.id === ids.elig);
        assert.equal(item?.status, "locked");
      } finally {
        await prisma.portalUser.update({ where: { id: eligible.user.id }, data: { accountLocked: false } });
      }
    });

    await t.test("duplicates: same email in any letter case / spacing is rejected", async () => {
      for (const email of [`${TAG}-elig@example.com`, `${TAG}-ELIG@EXAMPLE.COM`, ` ${TAG}-nobody@example.com`]) {
        const res = await post(pmoManager.headers, { displayName: "Dup", email });
        assert.equal(res.status, 409, email);
      }
      // Concurrent adds of one new email: exactly one wins.
      const email = `${TAG}-race@example.com`;
      const results = await Promise.all([
        post(admin.headers, { displayName: "Race A", email }),
        post(admin.headers, { displayName: "Race B", email: email.toUpperCase() }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.equal(await prisma.pmoCoordinator.count({ where: { emailNormalized: email.toLowerCase() } }), 1);
    });

    await t.test("validation: bad email / blank name / unknown field rejected, nothing saved", async () => {
      assert.equal((await post(admin.headers, { displayName: "Bad", email: "not-an-email" })).status, 400);
      assert.equal((await post(admin.headers, { displayName: "  ", email: `${TAG}-blank@example.com` })).status, 400);
      for (const body of [
        { displayName: "Renamed", unexpected: true },
        { email: "not-an-email" },
      ]) {
        const res = await fetch(`${url}/pmo-coordinators/${ids.noaccount}`, {
          method: "PATCH",
          headers: admin.headers,
          body: JSON.stringify(body),
        });
        assert.equal(res.status, 400);
      }
      const row = await prisma.pmoCoordinator.findUniqueOrThrow({ where: { id: ids.noaccount! } });
      assert.equal(row.email, `${TAG}-nobody@example.com`);
      assert.equal(row.displayName, "PmoCoord noaccount");
    });

    await t.test("update: rename (managers only); email editable while nothing is assigned", async () => {
      const patch = (h: Record<string, string>) =>
        fetch(`${url}/pmo-coordinators/${ids.noaccount}`, {
          method: "PATCH",
          headers: h,
          body: JSON.stringify({ displayName: "PmoCoord Renamed" }),
        });
      assert.equal((await patch(engineer.headers)).status, 403);
      assert.equal((await patch(readOnly.headers)).status, 403);
      const res = await patch(pmoManager.headers);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { data: Item };
      assert.equal(json.data.displayName, "PmoCoord Renamed");
      assert.equal(json.data.email, `${TAG}-nobody@example.com`);
      const email = await fetch(`${url}/pmo-coordinators/${ids.noaccount}`, {
        method: "PATCH",
        headers: admin.headers,
        body: JSON.stringify({ email: `${TAG}-nobody2@example.com` }),
      });
      assert.equal(email.status, 200);
      const moved = await prisma.pmoCoordinator.findUniqueOrThrow({ where: { id: ids.noaccount! } });
      assert.equal(moved.emailNormalized, `${tagLower}-nobody2@example.com`);
      const missing = await fetch(`${url}/pmo-coordinators/does-not-exist`, {
        method: "PATCH",
        headers: admin.headers,
        body: JSON.stringify({ displayName: "Y" }),
      });
      assert.equal(missing.status, 404);
    });

    await t.test("removal: blocked while assigned (active or archived), allowed once unassigned", async () => {
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-P1`, client: "PmoCoord Client", department: "Process",
          domesticForeign: "Domestic", projectTitle: "PmoCoord P1", workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM",
          createdByUserId: admin.user.id, pmoCoordinatorUserId: eligible.user.id,
        },
      });
      createdProjectIds.push(project.id);
      const del = (h: Record<string, string>) => fetch(`${url}/pmo-coordinators/${ids.elig}`, { method: "DELETE", headers: h });

      assert.equal((await del(engineer.headers)).status, 403);
      assert.equal((await del(readOnly.headers)).status, 403);

      const item = (await list(admin.headers)).find((i) => i.id === ids.elig);
      assert.equal(item?.assignedProjectCount, 1);

      const blocked = await del(admin.headers);
      assert.equal(blocked.status, 409);
      assert.match(((await blocked.json()) as { message: string }).message, /1 active project/);

      await prisma.project.update({ where: { id: project.id }, data: { isDeleted: true } });
      const blockedArchived = await del(pmoManager.headers);
      assert.equal(blockedArchived.status, 409);
      assert.match(((await blockedArchived.json()) as { message: string }).message, /1 archived project/);

      // Blocked removals changed nothing.
      assert.ok(await prisma.pmoCoordinator.findUnique({ where: { id: ids.elig! } }));
      const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      assert.equal(after.pmoCoordinatorUserId, eligible.user.id);

      await prisma.project.update({ where: { id: project.id }, data: { pmoCoordinatorUserId: null } });
      assert.equal((await del(admin.headers)).status, 200);
      assert.equal(await prisma.pmoCoordinator.findUnique({ where: { id: ids.elig! } }), null);
      assert.equal((await del(admin.headers)).status, 404);

      // An entry with no account can always be removed.
      const r = await fetch(`${url}/pmo-coordinators/${ids.noaccount}`, { method: "DELETE", headers: pmoManager.headers });
      assert.equal(r.status, 200);
    });

    await t.test("seeded approved list and accounts are untouched", async () => {
      const seededAfter = await prisma.pmoCoordinator.findMany({
        where: { createdByUserId: null },
        orderBy: { id: "asc" },
      });
      assert.deepEqual(seededAfter, seededBefore);
      assert.equal(await prisma.portalUser.count({ where: { email: { startsWith: TAG, mode: "insensitive" } } }), portalUserCountBefore);
    });
  } finally {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.pmoCoordinator.deleteMany({ where: { emailNormalized: { startsWith: tagLower } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
