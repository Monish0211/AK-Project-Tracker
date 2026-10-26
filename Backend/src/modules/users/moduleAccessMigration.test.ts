import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import pg from "pg";
import { env } from "../../shared/utils/env.js";

/**
 * Migration 20261024120000_add_add_project_and_pr_request_modules — backfill + idempotency, verified by executing the REAL
 * migration.sql inside a transaction that is always ROLLED BACK (nothing this test does is ever committed, so it is safe on any
 * database the other tests already use). Covers: the two Module rows (and "Approvals") are created exactly once; "Add Project"
 * goes to Projects holders who are not Read Only; "PR Request" goes to Approvals holders who are not Read Only; nobody else is
 * granted anything; existing grants are untouched; a second execution changes nothing — not even re-granting something an
 * Administrator revoked in between; and a missing "Approvals" row is recreated without duplicates.
 */

const MIGRATION_SQL = readFileSync(
  new URL("../../../prisma/migrations/20261024120000_add_add_project_and_pr_request_modules/migration.sql", import.meta.url),
  "utf8"
);

async function withRolledBackTransaction(run: (client: pg.Client) => Promise<void>): Promise<void> {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await run(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

async function makeUser(client: pg.Client, label: string, roleName: string, moduleNames: string[]): Promise<string> {
  const user = await client.query(
    `INSERT INTO "PortalUser" ("fullName","email","passwordHash","roleId","updatedAt")
     SELECT $1, $2, 'x', "id", CURRENT_TIMESTAMP FROM "PortalRole" WHERE "name" = $3 RETURNING "id"`,
    [`Migration ${label}`, `mig-${Date.now()}-${label}@example.com`, roleName]
  );
  const userId = user.rows[0].id as string;
  for (const name of moduleNames) {
    await client.query(`INSERT INTO "UserModuleAccess" ("userId","moduleId") SELECT $1, "id" FROM "Module" WHERE "name" = $2`, [userId, name]);
  }
  return userId;
}

async function modulesOf(client: pg.Client, userId: string): Promise<string[]> {
  const r = await client.query(
    `SELECT m."name" FROM "UserModuleAccess" uma JOIN "Module" m ON m."id" = uma."moduleId" WHERE uma."userId" = $1 ORDER BY m."name"`,
    [userId]
  );
  return r.rows.map((row) => row.name as string);
}

/** Puts the database in the exact pre-migration state: the two new modules do not exist (cascade removes their grants). */
async function resetToPreMigrationState(client: pg.Client): Promise<void> {
  await client.query(`DELETE FROM "Module" WHERE "name" IN ('Add Project','PR Request')`);
}

test("migration backfills exactly the users who could already create projects / submit PR Requests, and is idempotent", async () => {
  await withRolledBackTransaction(async (client) => {
    await resetToPreMigrationState(client);

    const pm = await makeUser(client, "pm", "Project Manager", ["Projects"]);
    const readOnly = await makeUser(client, "ro", "Read Only", ["Projects", "Approvals"]);
    const accounts = await makeUser(client, "acct", "Accounts", ["Approvals"]);
    const engineer = await makeUser(client, "eng", "Engineer", ["Projects", "Approvals", "Dashboard"]);
    const finance = await makeUser(client, "fin", "Finance", ["Invoices"]);
    const none = await makeUser(client, "none", "Engineer", []);

    await client.query(MIGRATION_SQL);

    assert.deepEqual(await modulesOf(client, pm), ["Add Project", "Projects"]);
    assert.deepEqual(await modulesOf(client, readOnly), ["Approvals", "Projects"], "Read Only users get neither new permission");
    assert.deepEqual(await modulesOf(client, accounts), ["Approvals", "PR Request"], "Approvals does NOT imply Add Project");
    assert.deepEqual(await modulesOf(client, engineer), ["Add Project", "Approvals", "Dashboard", "PR Request", "Projects"]);
    assert.deepEqual(await modulesOf(client, finance), ["Invoices"], "users without Projects / Approvals gain nothing");
    assert.deepEqual(await modulesOf(client, none), []);

    const rows = await client.query(`SELECT "name", count(*)::int AS n FROM "Module" WHERE "name" IN ('Approvals','Add Project','PR Request') GROUP BY "name"`);
    assert.deepEqual(Object.fromEntries(rows.rows.map((r) => [r.name, r.n])), { Approvals: 1, "Add Project": 1, "PR Request": 1 });

    // Second execution: nothing changes. An Administrator's later revocation is NOT undone either.
    await client.query(`DELETE FROM "UserModuleAccess" WHERE "userId" = $1 AND "moduleId" = (SELECT "id" FROM "Module" WHERE "name" = 'Add Project')`, [pm]);
    const before = (await client.query(`SELECT count(*)::int AS n FROM "UserModuleAccess"`)).rows[0].n as number;
    await client.query(MIGRATION_SQL);
    const after = (await client.query(`SELECT count(*)::int AS n FROM "UserModuleAccess"`)).rows[0].n as number;
    assert.equal(after, before, "re-running adds no grants");
    assert.deepEqual(await modulesOf(client, pm), ["Projects"], "a revoked grant is not re-granted on re-run");

    const dupes = await client.query(`SELECT count(*)::int AS n FROM (SELECT 1 FROM "UserModuleAccess" GROUP BY "userId","moduleId" HAVING count(*) > 1) d`);
    assert.equal(dupes.rows[0].n, 0, "no duplicate (user, module) rows");
  });
});

test("migration creates a missing Approvals row once and never duplicates module rows", async () => {
  await withRolledBackTransaction(async (client) => {
    await client.query(`DELETE FROM "Module" WHERE "name" IN ('Approvals','Add Project','PR Request')`);
    await client.query(MIGRATION_SQL);
    await client.query(MIGRATION_SQL);
    const rows = await client.query(`SELECT "name", count(*)::int AS n FROM "Module" WHERE "name" IN ('Approvals','Add Project','PR Request') GROUP BY "name"`);
    assert.deepEqual(Object.fromEntries(rows.rows.map((r) => [r.name, r.n])), { Approvals: 1, "Add Project": 1, "PR Request": 1 });
    const grants = await client.query(
      `SELECT count(*)::int AS n FROM "UserModuleAccess" uma JOIN "Module" m ON m."id" = uma."moduleId" WHERE m."name" = 'PR Request'`
    );
    assert.equal(grants.rows[0].n, 0, "no one held Approvals, so nobody is backfilled with PR Request");
  });
});
