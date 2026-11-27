// PR detail page Edit button (Nov 2026): shown only to who may already edit the request; it opens the EXISTING review form and changes nothing by itself.
//
// Run: node --test --test-concurrency=1 --test-timeout=240000 tests/prRequestEditAccess.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());
const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

const req = (over = {}) => ({ id: "r1", status: "Pending Accounts Approval", requestedByUserId: "u-req", assignedAccountsApproverId: "u-acc", assignedPmoManagerId: "u-pmo", ...over });
const user = (id, modules) => ({ id, modules });
const path = async (r, u, admin = false) => (await load("/src/pages/PRRequests/prRequestEditAccess.ts")).prRequestEditPath(r, u, admin);

test("the assigned Accounts approver sees Edit on a request pending Accounts -> the existing review page of the SAME request", async () => {
  assert.equal(await path(req(), user("u-acc", ["Approvals"])), "/pr-requests/r1/edit");
});

test("the assigned PMO Manager sees Edit on a request pending PMO", async () => {
  assert.equal(await path(req({ status: "Pending PMO Manager Approval" }), user("u-pmo", ["Approvals"])), "/pr-requests/r1/edit");
});

test("the requester sees Edit on their own Draft", async () => {
  assert.equal(await path(req({ status: "Draft" }), user("u-req", ["PR Request"])), "/pr-requests/r1/edit");
});

test("no Edit for: another stage's approver, an unrelated user, the requester once submitted, a user without the module", async () => {
  assert.equal(await path(req(), user("u-pmo", ["Approvals"])), null, "PMO approver while it is at Accounts");
  assert.equal(await path(req({ status: "Pending PMO Manager Approval" }), user("u-acc", ["Approvals"])), null, "Accounts approver while it is at PMO");
  assert.equal(await path(req(), user("u-other", ["Approvals", "PR Request"])), null, "unrelated user");
  assert.equal(await path(req(), user("u-req", ["PR Request"])), null, "requester after submitting");
  assert.equal(await path(req(), user("u-acc", ["PR Request"])), null, "assigned but module missing");
  assert.equal(await path(req({ status: "Draft" }), user("u-req", ["Approvals"])), null, "requester without the PR Request module");
  assert.equal(await path(req(), null), null, "no session");
});

test("no Edit once finalized, whoever asks", async () => {
  for (const status of ["Approved", "Rejected", "Deleted"]) {
    assert.equal(await path(req({ status }), user("u-acc", ["Approvals"])), null, status);
    assert.equal(await path(req({ status }), user("u-acc", ["Approvals"]), true), null, `${status} (admin)`);
  }
});

test("the administrator page links to the existing administrative review page, only while the request is still open", async () => {
  assert.equal(await path(req(), user("u-admin", ["Approvals"]), true), "/admin/pr-requests/r1/review");
  assert.equal(await path(req({ status: "Draft" }), user("u-admin", []), true), "/admin/pr-requests/r1/review");
});

test("the Edit link only navigates: no API call, no status change, separate from Approve / Reject / Create Project", () => {
  const page = src("pages/PRRequests/PRRequestDetail.tsx");
  assert.match(page, /onClick=\{\(\) => navigate\(editPath\)\}/);
  assert.match(page, /data-testid="pr-edit-button"/);
  const helper = src("pages/PRRequests/prRequestEditAccess.ts");
  assert.doesNotMatch(helper, /fetch|apiClient|approvePR|rejectPR/i);
  // the Approve / Reject bar is still gated by its own flags and its own handlers
  assert.match(page, /canActOnAccountsStage/);
  assert.match(page, /canActOnPmoStage/);
});

test("no new page or form: the Edit destinations are the routes that already exist", () => {
  const layout = src("layouts/MainLayout.tsx");
  assert.match(layout, /\/pr-requests\/:id\/edit/);
  assert.match(layout, /\/admin\/pr-requests\/:id\/review/);
});
