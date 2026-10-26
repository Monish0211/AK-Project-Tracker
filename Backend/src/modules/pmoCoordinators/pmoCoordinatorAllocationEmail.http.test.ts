import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { env } from "../../shared/utils/env.js";
import type { SendEmailOptions } from "../../shared/email/email.types.js";
import {
  isAllocationEmailEnabled,
  setAllocationEmailFlagForTests,
  setAllocationEmailSenderForTests,
} from "./services/pmoCoordinatorAllocationEmail.service.js";
import { createProject } from "../projects/services/project.service.js";

/**
 * PMO Coordinator allocation email (Phase 7). A FAKE sender records every
 * attempt — nothing is ever delivered — and the switch is driven through the
 * test override with the same parsing rule as PMO_ALLOCATION_EMAIL_ENABLED.
 * Isolated @example.com fixtures, removed in `finally`. Primary PM / status
 * are never changed, so the unrelated Project Notification emails never fire.
 */

const TAG = `pmoalloc-${Date.now()}`;
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
    poMonth: "2026-10", prCategory: "India", prNo: `PR-${TAG}-${suffix}`, client: "Alloc <Client> & Co",
    department: "Process", domesticForeign: "Domestic", projectTitle: `Alloc Project ${suffix}`,
    workOrderStatus: "Received", projectStartDate: new Date("2026-01-01").toISOString(), projectStatus: "Active",
    workOrderNumber: `WO-${TAG}-${suffix}`, workOrderDate: new Date("2026-01-01").toISOString(), rfqNo: "RFQ-TEST", eicName: "EIC",
    contractType: "LUMP SUM", pmoCoordinator: "Typed Name", ...extra,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("PMO Coordinator allocation email — switch, change detection, recipient, failures, concurrency", async (t) => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const sent: SendEmailOptions[] = [];
  let senderMode: "ok" | "fail" | "throw" = "ok";

  // Installed before anything else, and always: nothing can reach SMTP.
  setAllocationEmailSenderForTests(async (options) => {
    sent.push(options);
    if (senderMode === "throw") throw new Error("simulated SMTP outage");
    if (senderMode === "fail") return { success: false, error: "simulated rejection" };
    return { success: true };
  });

  /**
   * Runs `action`, waits until the `expected` number of fire-and-forget
   * attempts has arrived (up to 8s — they can lag under parallel test load),
   * then a further quiet period so any EXTRA (duplicate) attempt is caught
   * too, and returns every attempt that arrived.
   */
  async function attemptsAfter(action: () => Promise<unknown>, expected = 0): Promise<SendEmailOptions[]> {
    const before = sent.length;
    await action();
    const deadline = Date.now() + 8000;
    while (sent.length - before < expected && Date.now() < deadline) await sleep(50);
    await sleep(600);
    return sent.slice(before);
  }

  try {
    const roles = Object.fromEntries(
      await Promise.all(["Administrator", "Engineer"].map(async (n) => [n, await prisma.portalRole.findUniqueOrThrow({ where: { name: n } })]))
    );
    const [settingsModule, projectsModule, addProjectModule] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Settings" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Add Project" } }),
    ]);
    const passwordHash = await hashPassword("PmoAllocTest@123");
    async function makeUser(key: string, roleName: string, modules: string[], extra: Record<string, unknown> = {}) {
      const role = roles[roleName]!;
      const user = await prisma.portalUser.create({
        data: {
          fullName: `Alloc ${key} Account`, email: `${TAG}-${key}@example.com`, passwordHash, department: "PMO",
          roleId: role.id, forcePasswordChange: false,
          moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) }, ...extra,
        },
      });
      createdUserIds.push(user.id);
      const token = signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: role.name });
      return { user, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
    }
    const admin = await makeUser("admin", "Administrator", [settingsModule.id, projectsModule.id, addProjectModule.id]);
    const coordA = await makeUser("coord-a", "Engineer", [projectsModule.id]);
    const coordB = await makeUser("coord-b", "Engineer", [projectsModule.id]);
    await makeUser("locked", "Engineer", [projectsModule.id], { accountLocked: true });

    const register = async (key: string, displayName: string) => {
      const res = await fetch(`${url}/pmo-coordinators`, {
        method: "POST", headers: admin.headers, body: JSON.stringify({ displayName, email: `${TAG}-${key}@example.com` }),
      });
      assert.equal(res.status, 201);
      return ((await res.json()) as { data: { id: string } }).data.id;
    };
    const E = {
      a: await register("coord-a", "Alloc Coordinator A"),
      b: await register("coord-b", "Alloc Coordinator B"),
      locked: await register("locked", "Alloc Locked"),
    };
    const api = (method: string, path: string, body?: unknown) =>
      fetch(`${url}${path}`, { method, headers: admin.headers, ...(body !== undefined && { body: JSON.stringify(body) }) });
    const create = async (suffix: string, extra: Record<string, unknown> = {}) => {
      const res = await api("POST", "/projects", projectBody(suffix, extra));
      const json = (await res.json()) as { data?: { id: string } };
      return { status: res.status, id: json.data?.id };
    };

    await t.test("switch missing (default): env default is false and nothing is sent", async () => {
      assert.equal(env.PMO_ALLOCATION_EMAIL_ENABLED, false, "PMO_ALLOCATION_EMAIL_ENABLED is unset in this environment");
      setAllocationEmailFlagForTests(undefined);
      assert.equal(isAllocationEmailEnabled(), false);
      const got = await attemptsAfter(async () => assert.equal((await create("OFF1", { pmoCoordinatorEntryId: E.a })).status, 201));
      assert.equal(got.length, 0);
      setAllocationEmailFlagForTests(null);
      assert.equal(isAllocationEmailEnabled(), false);
    });

    await t.test("switch explicitly false (and other non-'true' values): nothing is sent", async () => {
      for (const raw of ["false", "", "TRUE", "1", "yes"]) {
        setAllocationEmailFlagForTests(raw);
        assert.equal(isAllocationEmailEnabled(), false, raw);
      }
      setAllocationEmailFlagForTests("false");
      const got = await attemptsAfter(async () => assert.equal((await create("OFF2", { pmoCoordinatorEntryId: E.b })).status, 201));
      assert.equal(got.length, 0);
    });

    setAllocationEmailFlagForTests("true");
    let P = "";

    await t.test("new project with a linked coordinator: exactly one attempt, to the account email, with correct content", async () => {
      let id: string | undefined;
      const got = await attemptsAfter(async () => {
        const r = await create("NEW", { pmoCoordinatorEntryId: E.a });
        assert.equal(r.status, 201);
        id = r.id;
      }, 1);
      P = id!;
      assert.equal(got.length, 1);
      const mail = got[0]!;
      assert.equal(mail.to, coordA.user.email, "recipient is the linked PortalUser email");
      assert.equal(mail.subject, `PMO Project Assigned to You — PR-${TAG}-NEW`);
      const projectUrl = `${env.FRONTEND_URL}/projects/view/${P}`;
      for (const part of [`PR-${TAG}-NEW`, `Alloc Project NEW`, "Alloc &lt;Client&gt; &amp; Co", projectUrl, "Hello Alloc coord-a Account,", "PMO Coordinator"]) {
        assert.ok(mail.html.includes(part), `html contains ${part}`);
      }
      assert.ok(!mail.html.includes("<Client>"), "user text is escaped in HTML");
      assert.ok(mail.text?.includes(projectUrl) && mail.text.includes("Client: Alloc <Client> & Co"));
      assert.ok(!/password|token|₹|INR|amount/i.test(mail.html + mail.text), "no credentials or financial data");
      const row = await prisma.project.findUniqueOrThrow({ where: { id: P } });
      assert.equal(row.pmoCoordinatorUserId, coordA.user.id);
      assert.ok(row.pmoCoordinatorAssignedAt);
    });

    await t.test("reassignment: exactly one attempt, to the NEW coordinator only", async () => {
      const got = await attemptsAfter(async () => assert.equal((await api("PATCH", `/projects/${P}`, { pmoCoordinatorEntryId: E.b })).status, 200), 1);
      assert.equal(got.length, 1);
      assert.equal(got[0]!.to, coordB.user.email);
      assert.ok(!got.some((m) => m.to === coordA.user.email));
    });

    await t.test("unchanged coordinator (re-save, other field edits, repeated saves): no attempt", async () => {
      const assignedAt = (await prisma.project.findUniqueOrThrow({ where: { id: P } })).pmoCoordinatorAssignedAt;
      const got = await attemptsAfter(async () => {
        assert.equal((await api("PATCH", `/projects/${P}`, { pmoCoordinatorEntryId: E.b })).status, 200);
        assert.equal((await api("PATCH", `/projects/${P}`, { pmoCoordinatorEntryId: E.b, projectTitle: "Alloc Project NEW (edited)" })).status, 200);
        assert.equal((await api("PATCH", `/projects/${P}`, { remarks: "no coordinator field at all" })).status, 200);
      });
      assert.equal(got.length, 0);
      assert.deepEqual((await prisma.project.findUniqueOrThrow({ where: { id: P } })).pmoCoordinatorAssignedAt, assignedAt);
    });

    await t.test("concurrent saves of the same new assignment: exactly one attempt", async () => {
      const got = await attemptsAfter(async () => {
        const results = await Promise.all(
          Array.from({ length: 4 }, () => api("PATCH", `/projects/${P}`, { pmoCoordinatorEntryId: E.a }))
        );
        assert.deepEqual(results.map((r) => r.status), [200, 200, 200, 200]);
      }, 1);
      assert.equal(got.length, 1);
      assert.equal(got[0]!.to, coordA.user.email);
    });

    await t.test("ineligible (locked) coordinator: rejected, nothing saved, no attempt", async () => {
      const got = await attemptsAfter(async () => assert.equal((await api("PATCH", `/projects/${P}`, { pmoCoordinatorEntryId: E.locked })).status, 400));
      assert.equal(got.length, 0);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: P } })).pmoCoordinatorUserId, coordA.user.id);
    });

    await t.test("save failure (duplicate PR number) together with a coordinator change: no attempt", async () => {
      const other = await create("OTHER");
      assert.equal(other.status, 201);
      const got = await attemptsAfter(async () =>
        assert.equal((await api("PATCH", `/projects/${P}`, { pmoCoordinatorEntryId: E.b, prNo: `PR-${TAG}-OTHER` })).status, 409)
      );
      assert.equal(got.length, 0);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: P } })).pmoCoordinatorUserId, coordA.user.id);
    });

    await t.test("email failure after a successful save: the assignment stays saved", async () => {
      for (const mode of ["fail", "throw"] as const) {
        senderMode = mode;
        const target = mode === "fail" ? E.b : E.a;
        const targetUser = mode === "fail" ? coordB.user : coordA.user;
        const got = await attemptsAfter(async () => assert.equal((await api("PATCH", `/projects/${P}`, { pmoCoordinatorEntryId: target })).status, 200), 1);
        assert.equal(got.length, 1, mode);
        assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: P } })).pmoCoordinatorUserId, targetUser.id, mode);
      }
      senderMode = "ok";
    });

    await t.test("coordinator removed (typed text replaces the link): no attempt", async () => {
      const got = await attemptsAfter(async () => assert.equal((await api("PATCH", `/projects/${P}`, { pmoCoordinator: "Someone Typed" })).status, 200));
      assert.equal(got.length, 0);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: P } })).pmoCoordinatorUserId, null);
    });

    await t.test("typed coordinator name matching a registered coordinator: no link, no attempt", async () => {
      let id: string | undefined;
      const got = await attemptsAfter(async () => {
        const r = await create("TYPED", { pmoCoordinator: "Alloc Coordinator A" });
        assert.equal(r.status, 201);
        id = r.id;
      });
      assert.equal(got.length, 0);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: id! } })).pmoCoordinatorUserId, null);
    });

    await t.test("Excel import and the PR Request approval path (createProject without an entry): no attempt", async () => {
      const got = await attemptsAfter(async () => {
        const res = await api("POST", "/projects/import", {
          projects: [projectBody("IMP", { pmoCoordinatorEntryId: E.a, pmoCoordinator: "Alloc Coordinator A" })],
        });
        assert.equal(res.status, 201);
        // prRequest.service.ts approves by calling this exact function with the
        // draft's general info, which never carries pmoCoordinatorEntryId.
        await createProject(
          { ...projectBody("PRAPPROVAL"), projectStartDate: new Date("2026-01-01"), workOrderDate: new Date("2026-01-01") } as never,
          admin.user.id
        );
      });
      assert.equal(got.length, 0);
      assert.equal(await prisma.project.count({ where: { prNo: { in: [`PR-${TAG}-IMP`, `PR-${TAG}-PRAPPROVAL`] }, pmoCoordinatorUserId: { not: null } } }), 0);
    });

    await t.test("every attempt in this run went to a linked fixture account (never typed text)", async () => {
      assert.ok(sent.length > 0);
      for (const mail of sent) assert.ok([coordA.user.email, coordB.user.email].includes(String(mail.to)), String(mail.to));
    });
  } finally {
    setAllocationEmailFlagForTests(null);
    setAllocationEmailSenderForTests(null);
    await sleep(200);
    await prisma.project.deleteMany({ where: { prNo: { startsWith: `PR-${TAG}` } } });
    await prisma.pmoCoordinator.deleteMany({ where: { emailNormalized: { startsWith: tagLower } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
