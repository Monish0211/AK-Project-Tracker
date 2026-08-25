import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { PR_CATEGORY_PREFIX_MAP } from "./project.constants.js";

/**
 * Region -> PR Category -> PR Number prefix business rule.
 *
 * prCategory doubles as "Region" on the Project row itself (see
 * schema.prisma's Project model comment) — there is no separate region
 * field. This proves the rule is enforced server-side (never bypassable by
 * a direct API call, regardless of what the frontend sends) for every one
 * of the 7 fixed category/prefix pairs, on both create and update, without
 * weakening the pre-existing PR Number uniqueness protection and without
 * rewriting any pre-existing project's data it doesn't touch.
 */

const TAG = `pr-cat-prefix-${Date.now()}`;

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

interface ProjectResponse {
  success: boolean;
  data?: { id: string; prCategory?: string; prNo?: string };
  message?: string;
}

/** Every field createProjectSchema requires, with prCategory/prNo overridable per test case. */
function projectPayload(overrides: { prCategory: unknown; prNo: unknown }, suffix: string) {
  return {
    poMonth: "2026-08",
    prCategory: overrides.prCategory,
    prNo: overrides.prNo,
    client: "PR Category Prefix Regression Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: `PR Category Prefix regression ${suffix}`,
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01").toISOString(),
    projectStatus: "Active",
    workOrderNumber: `${TAG}-${suffix}-WO`,
    eicName: "EIC",
    workOrderDate: new Date("2026-01-01").toISOString(),
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
  };
}

test("Region -> PR Category -> PR Number prefix rule is enforced server-side", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [adminRole, projectsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    ]);
    const passwordHash = await hashPassword("PrCategoryPrefixTest@123");
    const user = await prisma.portalUser.create({
      data: {
        fullName: "PR Category Prefix Test Admin",
        email: `${TAG}@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(user.id);
    const token = tokenFor({ ...user, roleName: adminRole.name });
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    const post = (body: unknown) => fetch(`${url}/projects`, { method: "POST", headers, body: JSON.stringify(body) });
    const patch = (id: string, body: unknown) =>
      fetch(`${url}/projects/${id}`, { method: "PATCH", headers, body: JSON.stringify(body) });

    let seq = 0;
    const nextSuffix = () => `${seq++}`;

    // ---- Every mapping PASSES with its own correct prefix ----
    const categories = Object.keys(PR_CATEGORY_PREFIX_MAP) as (keyof typeof PR_CATEGORY_PREFIX_MAP)[];
    for (const category of categories) {
      const prefix = PR_CATEGORY_PREFIX_MAP[category];
      const suffix = nextSuffix();
      const prNo = `${prefix}${TAG}-${suffix}`;
      const res = await post(projectPayload({ prCategory: category, prNo }, suffix));
      assert.equal(res.status, 201, `${category} + "${prNo}" must be accepted (got ${res.status}: ${JSON.stringify(await res.clone().json())})`);
      const json = (await res.json()) as ProjectResponse;
      createdProjectIds.push(json.data!.id);
    }

    // ---- Every mapping FAILS when paired with a DIFFERENT category's
    // prefix — exactly the cross-mapping cases the task specifies ----
    const crossCases: { category: keyof typeof PR_CATEGORY_PREFIX_MAP; wrongPrNo: string }[] = [
      { category: "India", wrongPrNo: "Q-PR-123" },
      { category: "Malaysia", wrongPrNo: "PR-123" },
      { category: "Oman", wrongPrNo: "MYPR123" },
      { category: "Abu Dhabi", wrongPrNo: "PR-123" },
      { category: "FZI", wrongPrNo: "PR-123" },
      { category: "Elixir Qatar", wrongPrNo: "Q-PR-123" },
      { category: "Qatar", wrongPrNo: "PR-123" },
    ];
    for (const { category, wrongPrNo } of crossCases) {
      const suffix = nextSuffix();
      const res = await post(projectPayload({ prCategory: category, prNo: `${wrongPrNo}-${TAG}-${suffix}` }, suffix));
      assert.equal(res.status, 400, `${category} + "${wrongPrNo}" must be rejected`);
      const json = (await res.json()) as ProjectResponse;
      assert.match(json.message ?? "", /must start with/i);
    }

    // ---- The two exact malicious-request examples from the spec ----
    {
      const suffix = nextSuffix();
      const res = await post(projectPayload({ prCategory: "India", prNo: `Q-PR-123-${TAG}-${suffix}` }, suffix));
      assert.equal(res.status, 400, "malicious request: India + Q-PR-123-style prNo must be rejected");
    }
    {
      const suffix = nextSuffix();
      const res = await post(projectPayload({ prCategory: "Qatar", prNo: `PR-123-${TAG}-${suffix}` }, suffix));
      assert.equal(res.status, 400, "malicious request: Qatar + PR-123-style prNo must be rejected");
    }

    // ---- missing category ----
    {
      const suffix = nextSuffix();
      const res = await post(projectPayload({ prCategory: "", prNo: `PR-${TAG}-${suffix}` }, suffix));
      assert.equal(res.status, 400, "empty prCategory must be rejected");
    }

    // ---- unknown/invalid category (not one of the 7) ----
    {
      const suffix = nextSuffix();
      const res = await post(projectPayload({ prCategory: "Narnia", prNo: `PR-${TAG}-${suffix}` }, suffix));
      assert.equal(res.status, 400, "a category outside the fixed 7-value set must be rejected");
      const json = (await res.json()) as ProjectResponse;
      assert.match(json.message ?? "", /invalid pr category/i);
    }

    // ---- missing PR number (the pre-existing required-field rule, not the
    // new prefix rule — must still work exactly as before) ----
    {
      const suffix = nextSuffix();
      const res = await post(projectPayload({ prCategory: "India", prNo: "" }, suffix));
      assert.equal(res.status, 400, "empty prNo must still be rejected by the pre-existing required-field rule");
    }

    // ---- empty prefix portion: exactly the prefix, nothing after it ----
    {
      const suffix = nextSuffix();
      const res = await post(projectPayload({ prCategory: "India", prNo: "PR-" }, suffix));
      assert.equal(res.status, 400, `"PR-" alone (no suffix) must be rejected`);
      const json = (await res.json()) as ProjectResponse;
      assert.match(json.message ?? "", /must include a value after/i);
    }

    // ---- malformed prefix: missing the hyphen entirely ----
    {
      const suffix = nextSuffix();
      const res = await post(projectPayload({ prCategory: "India", prNo: `PR${TAG}-${suffix}` }, suffix));
      assert.equal(res.status, 400, `"PR..." without the hyphen must be rejected for India`);
    }

    // ---- case sensitivity: lowercase prefix must NOT match (every real PR
    // Number in the system is consistently uppercase) ----
    {
      const suffix = nextSuffix();
      const res = await post(projectPayload({ prCategory: "India", prNo: `pr-${TAG}-${suffix}` }, suffix));
      assert.equal(res.status, 400, `a lowercase "pr-" prefix must be rejected for India (case-sensitive)`);
    }

    // ---- duplicate PR number: the new rule must not weaken the pre-existing
    // uniqueness protection — a VALID category/prefix combination that
    // reuses an already-active prNo must still 409, not silently succeed or
    // be swallowed by the new 400-producing check ----
    {
      const suffix = nextSuffix();
      const prNo = `PR-${TAG}-DUP-${suffix}`;
      const first = await post(projectPayload({ prCategory: "India", prNo }, suffix));
      assert.equal(first.status, 201);
      createdProjectIds.push(((await first.json()) as ProjectResponse).data!.id);

      const dupeSuffix = nextSuffix();
      const dupe = await post(projectPayload({ prCategory: "India", prNo }, dupeSuffix));
      assert.equal(dupe.status, 409, "a duplicate prNo with a VALID category/prefix must still be rejected as a conflict, not a prefix error");
      const dupeJson = (await dupe.json()) as ProjectResponse;
      assert.match(dupeJson.message ?? "", /already exists/i);
    }

    // ---- normal project creation regression: an ordinary valid create is
    // completely unaffected by any of the above ----
    {
      const suffix = nextSuffix();
      const res = await post(projectPayload({ prCategory: "India", prNo: `PR-${TAG}-${suffix}` }, suffix));
      assert.equal(res.status, 201, "an ordinary valid project create must be unaffected by this rule");
      const json = (await res.json()) as ProjectResponse;
      createdProjectIds.push(json.data!.id);
      assert.equal(json.data!.prCategory, "India");
    }

    // ---- existing project update: unrelated field only — prCategory/prNo
    // untouched, so no re-validation and no rewrite of either ----
    {
      const suffix = nextSuffix();
      const createRes = await post(projectPayload({ prCategory: "India", prNo: `PR-${TAG}-${suffix}` }, suffix));
      const created = ((await createRes.json()) as ProjectResponse).data!;
      createdProjectIds.push(created.id);

      const updateRes = await patch(created.id, { projectTitle: "Renamed via unrelated-field update" });
      assert.equal(updateRes.status, 200, "an update that never touches prCategory/prNo must succeed unconditionally");
      const updated = ((await updateRes.json()) as ProjectResponse).data!;
      assert.equal(updated.prCategory, "India");
      assert.equal(updated.prNo, `PR-${TAG}-${suffix}`, "prNo must be completely untouched by an unrelated field update");
    }

    // ---- existing project update: changing prCategory WITHOUT updating
    // prNo to match must be rejected — never silently leaves a stale prefix
    // behind, and never auto-rewrites the number for the caller ----
    {
      const suffix = nextSuffix();
      const createRes = await post(projectPayload({ prCategory: "India", prNo: `PR-${TAG}-${suffix}` }, suffix));
      const created = ((await createRes.json()) as ProjectResponse).data!;
      createdProjectIds.push(created.id);

      const badUpdate = await patch(created.id, { prCategory: "Qatar" });
      assert.equal(badUpdate.status, 400, "changing prCategory alone, leaving the old India-prefixed prNo behind, must be rejected");

      const stillIndia = await prisma.project.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(stillIndia.prCategory, "India", "the rejected update must not have partially applied the category change");
    }

    // ---- existing project update: changing BOTH prCategory and prNo
    // together to a consistent new pair succeeds ----
    {
      const suffix = nextSuffix();
      const createRes = await post(projectPayload({ prCategory: "India", prNo: `PR-${TAG}-${suffix}` }, suffix));
      const created = ((await createRes.json()) as ProjectResponse).data!;
      createdProjectIds.push(created.id);

      const newPrNo = `Q-PR-${TAG}-${suffix}`;
      const goodUpdate = await patch(created.id, { prCategory: "Qatar", prNo: newPrNo });
      assert.equal(goodUpdate.status, 200, "changing prCategory and prNo together to a consistent pair must succeed");
      const updated = ((await goodUpdate.json()) as ProjectResponse).data!;
      assert.equal(updated.prCategory, "Qatar");
      assert.equal(updated.prNo, newPrNo);
    }

    // ---- existing project update: changing prNo only, to a value that
    // still matches the UNCHANGED existing category, succeeds ----
    {
      const suffix = nextSuffix();
      const createRes = await post(projectPayload({ prCategory: "Malaysia", prNo: `MYPR${TAG}-${suffix}` }, suffix));
      const created = ((await createRes.json()) as ProjectResponse).data!;
      createdProjectIds.push(created.id);

      const newPrNo = `MYPR${TAG}-${suffix}-v2`;
      const res = await patch(created.id, { prNo: newPrNo });
      assert.equal(res.status, 200, "changing only prNo, still matching the existing category's prefix, must succeed");
    }

    // ---- existing project update: changing prNo only, to a value that no
    // longer matches the UNCHANGED existing category, is rejected ----
    {
      const suffix = nextSuffix();
      const createRes = await post(projectPayload({ prCategory: "Oman", prNo: `EE${TAG}-${suffix}` }, suffix));
      const created = ((await createRes.json()) as ProjectResponse).data!;
      createdProjectIds.push(created.id);

      const res = await patch(created.id, { prNo: `MYPR${TAG}-${suffix}` });
      assert.equal(res.status, 400, "changing prNo to a prefix that no longer matches the unchanged Oman category must be rejected");
    }
  } finally {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
