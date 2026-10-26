// "Add Project" and "PR Request" Module Access (Oct 2026): independent permissions, shown/saved/loaded consistently, driving the
// Project Repository buttons, the Dashboard Add Project links, route guards and the PR Requests page. Components are rendered
// server-side (no browser); the auth context is replaced by tests/stubs/authContextStub.ts so a signed-in user can be injected.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const stub = fileURLToPath(new URL("./stubs/authContextStub.ts", import.meta.url));
const toastStub = fileURLToPath(new URL("./stubs/toastStub.ts", import.meta.url));
const themeStub = fileURLToPath(new URL("./stubs/themeStub.ts", import.meta.url));
const notificationStub = fileURLToPath(new URL("./stubs/notificationServiceStub.ts", import.meta.url));

// Some services read localStorage at import time; a no-op shim keeps server-side rendering quiet (nothing here depends on its contents).
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 };

let vite;
let load;
let React;
let renderToStaticMarkup;
let MemoryRouter;
before(async () => {
  vite = await createServer({
    root,
    resolve: {
      alias: [
        { find: /^(\.{1,2}\/)+(auth\/)?authContext$/, replacement: stub },
        { find: /^(\.{1,2}\/)+(components\/ui\/)?usePmoToast$/, replacement: toastStub },
        { find: /^(\.{1,2}\/)+(context\/)?ThemeContext$/, replacement: themeStub },
        { find: /^(\.{1,2}\/)+(notifications\/)?notificationService$/, replacement: notificationStub },
      ],
    },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  load = (p) => vite.ssrLoadModule(p);
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ MemoryRouter } = await import("react-router-dom"));
});
after(() => vite?.close());

const session = (role, modules) => ({ id: "u1", name: "T", role, modules, regions: [], approvalPermissions: [], isAuthenticated: true });
const PM = (modules) => session("Project Manager", modules);

async function renderAs(user, componentPath, exportName = "default", props = {}) {
  globalThis.__permTestUser = user;
  const mod = await load(componentPath);
  const element = React.createElement(mod[exportName], props);
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, element));
}

const has = (html, text) => html.includes(text);

test("helpers: Add Project needs Projects + Add Project and is never offered to Read Only; PR Request is independent", async () => {
  const { canAddProject, canSubmitPRRequest, canReviewPRRequests, meetsModuleRequirement } = await load("/src/auth/permissions.ts");
  assert.equal(canAddProject(PM(["Projects", "Add Project"])), true);
  assert.equal(canAddProject(PM(["Projects"])), false, "Projects alone no longer creates");
  assert.equal(canAddProject(PM(["Add Project"])), false, "Add Project alone, without Projects, does nothing");
  assert.equal(canAddProject(PM(["Projects", "PR Request", "Approvals"])), false, "neither PR Request nor Approvals implies Add Project");
  assert.equal(canAddProject(null), false);
  assert.equal(canSubmitPRRequest(PM(["PR Request"])), true);
  assert.equal(canSubmitPRRequest(PM(["Approvals", "Projects", "Add Project"])), false, "neither Approvals nor Add Project implies PR Request");
  assert.equal(canReviewPRRequests(PM(["Approvals"])), true);
  assert.equal(canReviewPRRequests(PM(["PR Request"])), false, "PR Request never grants approval authority");
  // Read Only never receives write actions, even holding the modules.
  const ro = session("Read Only", ["Projects", "Add Project", "PR Request", "Approvals"]);
  assert.equal(canAddProject(ro), false);
  assert.equal(canSubmitPRRequest(ro), false);
  // requirement semantics
  assert.equal(meetsModuleRequirement(PM(["A"]), { anyOf: ["A", "B"] }), true);
  assert.equal(meetsModuleRequirement(PM(["C"]), { anyOf: ["A", "B"] }), false);
  assert.equal(meetsModuleRequirement(PM(["A"]), { module: "A", alsoRequires: ["B"] }), false);
  assert.equal(meetsModuleRequirement(PM(["A", "B"]), { module: "A", alsoRequires: ["B"] }), true);
});

test("Project Repository: the four Add Project × PR Request combinations show exactly the right actions", async () => {
  const path = "/src/pages/Projects/components/RepositoryCreateActions.tsx";
  const cases = [
    [true, false, true, false],
    [false, true, false, true],
    [true, true, true, true],
    [false, false, false, false],
  ];
  for (const [canAdd, canRequestPR, wantAdd, wantPr] of cases) {
    const html = await renderAs(PM([]), path, "default", { canAdd, canRequestPR });
    assert.equal(has(html, "Add Project"), wantAdd, `Add Project for ${JSON.stringify({ canAdd, canRequestPR })}`);
    assert.equal(has(html, "New PR Request"), wantPr, `New PR Request for ${JSON.stringify({ canAdd, canRequestPR })}`);
    assert.equal(has(html, "repository-create-actions"), wantAdd || wantPr, "no empty container when neither is allowed");
  }
  // Both buttons live in the SAME action area, Add Project first.
  const both = await renderAs(PM([]), path, "default", { canAdd: true, canRequestPR: true });
  assert.ok(both.indexOf("Add Project") < both.indexOf("New PR Request"));
});

test("Projects page wires the buttons and Import to the permissions (not to the role alone)", () => {
  const src = readFileSync(new URL("../src/pages/Projects/Projects.tsx", import.meta.url), "utf8");
  assert.match(src, /const canAdd = canAddProject\(user\)/);
  assert.match(src, /const canRequestPR = canSubmitPRRequest\(user\)/);
  assert.match(src, /<RepositoryCreateActions canAdd=\{canAdd\} canRequestPR=\{canRequestPR\} \/>/);
  // Import (bulk project creation) and its template follow Add Project.
  assert.match(src, /\{canAdd && \(\s*<>\s*<button\s+onClick=\{\(\) => fileInputRef\.current\?\.click\(\)\}/);
  assert.match(src, /mode !== "completed" && canAdd && \(/);
});

test("Dashboard: both Add Project links and the toolbar link follow Add Project", async () => {
  const withAdd = PM(["Dashboard", "Projects", "Add Project"]);
  const without = PM(["Dashboard", "Projects"]);
  const toolbar = "/src/pages/Dashboard/components/DashboardToolbar.tsx";
  const welcome = "/src/pages/Dashboard/components/WelcomeCard.tsx";
  for (const [path, props] of [[toolbar, { onRefresh: () => undefined }], [welcome, {}]]) {
    const on = await renderAs(withAdd, path, "default", props);
    const off = await renderAs(without, path, "default", props);
    assert.ok(on.includes('href="/projects/add"'), `${path}: link present with Add Project`);
    assert.ok(!off.includes('href="/projects/add"'), `${path}: link hidden without Add Project`);
    assert.ok(!off.includes("Add Project"), `${path}: no stray Add Project label without the permission`);
  }
  const ro = session("Read Only", ["Dashboard", "Projects", "Add Project"]);
  assert.ok(!(await renderAs(ro, welcome, "default", {})).includes('href="/projects/add"'), "Read Only never sees it");
});

test("Route guards: /projects/add needs Projects AND Add Project; /pr-requests/new needs PR Request; shared PR routes accept either", async () => {
  const route = async (user, props) =>
    renderAs(user, "/src/auth/ModuleRoute.tsx", "ModuleRoute", { ...props, children: React.createElement("p", null, "PAGE-CONTENT") });

  // /projects/add
  const add = { module: "Projects", alsoRequires: ["Add Project"] };
  assert.ok(has(await route(PM(["Projects", "Add Project"]), add), "PAGE-CONTENT"));
  const denied = await route(PM(["Projects"]), add);
  assert.ok(!has(denied, "PAGE-CONTENT") && has(denied, "Access Denied") && has(denied, "Add Project"), "typing /projects/add without the permission is blocked");
  assert.ok(!has(await route(PM(["Add Project"]), add), "PAGE-CONTENT"));

  // /pr-requests/new
  const neu = { module: "PR Request" };
  assert.ok(has(await route(PM(["PR Request"]), neu), "PAGE-CONTENT"));
  assert.ok(!has(await route(PM(["Approvals"]), neu), "PAGE-CONTENT"), "an approver without PR Request cannot open the new-request form");

  // shared requester/approver routes
  const shared = { anyOf: ["PR Request", "Approvals"] };
  assert.ok(has(await route(PM(["PR Request"]), shared), "PAGE-CONTENT"), "requester");
  assert.ok(has(await route(PM(["Approvals"]), shared), "PAGE-CONTENT"), "approver without PR Request is not blocked");
  assert.ok(!has(await route(PM(["Projects"]), shared), "PAGE-CONTENT"));
  assert.ok(!has(await route(null, shared), "PAGE-CONTENT"));

  // the real routes use exactly these requirements
  const layout = readFileSync(new URL("../src/layouts/MainLayout.tsx", import.meta.url), "utf8");
  const routeOf = (p) => layout.match(new RegExp(`path="${p.replace(/[/:]/g, "\\$&")}"\\s+element=\\{(<ModuleRoute[^>]*>)`))?.[1];
  assert.equal(routeOf("/projects/add"), '<ModuleRoute module="Projects" alsoRequires={["Add Project"]}>');
  assert.equal(routeOf("/pr-requests/new"), '<ModuleRoute module="PR Request">');
  for (const p of ["/pr-requests", "/pr-requests/:id/edit", "/pr-requests/:id"]) {
    assert.equal(routeOf(p), '<ModuleRoute anyOf={["PR Request", "Approvals"]}>', p);
  }
});

test("PR Requests page: New PR Request needs PR Request; the Approvals Queue tab needs Approvals; My Requests stays", async () => {
  const page = "/src/pages/PRRequests/PRRequests.tsx";
  const render = (modules, role = "Accounts") => renderAs(session(role, modules), page, "default", {});

  const prOnly = await render(["PR Request"]);
  assert.ok(has(prOnly, "New PR Request") && has(prOnly, "My Requests") && !has(prOnly, "Approvals Queue"));
  const approvalsOnly = await render(["Approvals"]);
  assert.ok(!has(approvalsOnly, "New PR Request") && has(approvalsOnly, "My Requests") && has(approvalsOnly, "Approvals Queue"));
  const both = await render(["PR Request", "Approvals"]);
  assert.ok(has(both, "New PR Request") && has(both, "Approvals Queue"));
  const readOnly = await render(["PR Request", "Approvals"], "Read Only");
  assert.ok(!has(readOnly, "New PR Request"), "Read Only is never offered a submission action");
});

test("User Module Access: both modules are listed, round-trip load → save without being dropped, and stay independent", async () => {
  const { MODULE_FIELDS, buildModuleAccess } = await load("/src/utils/accessFields.ts");
  const labels = MODULE_FIELDS.map((f) => f.label);
  assert.ok(labels.includes("Add Project") && labels.includes("PR Request") && labels.includes("Projects") && labels.includes("Approvals"));
  assert.equal(new Set(MODULE_FIELDS.map((f) => f.key)).size, MODULE_FIELDS.length, "no duplicate keys");

  // Loading what the backend returned, then collecting the ticked labels the way UserDrawer does on save, loses nothing.
  for (const names of [[], ["Projects"], ["Projects", "Add Project"], ["Approvals", "PR Request"], labels]) {
    const loaded = buildModuleAccess(names);
    const saved = MODULE_FIELDS.filter((f) => loaded[f.key]).map((f) => f.label);
    assert.deepEqual([...saved].sort(), [...names].sort(), `round trip for ${JSON.stringify(names)}`);
  }
  const onlyAdd = buildModuleAccess(["Add Project"]);
  assert.equal(onlyAdd.addProject, true);
  assert.equal(onlyAdd.prRequest, false);
  assert.equal(onlyAdd.projects, false, "Add Project does not turn Projects on");
  assert.equal(buildModuleAccess(["PR Request"]).addProject, false);
  assert.equal(buildModuleAccess(["Approvals"]).prRequest, false);
});

test("User view drawer lists every module (it used to keep a stale copy without Approvals) and reflects the new ones", async () => {
  const { buildModuleAccess, buildRegionAccess, buildApprovalRights } = await load("/src/utils/accessFields.ts");
  const user = {
    id: "1", employeeId: "E1", employeeName: "Test User", email: "t@example.com", department: "PMO", designation: "PM",
    employeeType: "Permanent", role: "Project Manager", status: "Active", isFirstLogin: false, lastLoginAt: null,
    moduleAccess: buildModuleAccess(["Projects", "Add Project", "Approvals"]),
    projectRegionAccess: buildRegionAccess([]), approvalRights: buildApprovalRights([]),
    accountSecurity: { accountLocked: false }, scopedUserIds: [], createdAt: "2026-01-01", createdBy: "x",
  };
  const html = await renderAs(PM([]), "/src/pages/Settings/components/userManagement/UserViewDrawer.tsx", "UserViewDrawer", {
    isOpen: true, user, onClose: () => undefined, onEdit: () => undefined,
  });
  for (const label of ["Add Project", "PR Request", "Approvals", "Projects"]) assert.ok(has(html, `>${label}<`), `${label} listed`);
});

test("Role defaults pre-fill the new modules only where the capability already existed", async () => {
  const { ROLE_MODULE_DEFAULTS } = await load("/src/utils/roleDefaults.ts");
  assert.equal(ROLE_MODULE_DEFAULTS["Read Only"].addProject, false);
  assert.equal(ROLE_MODULE_DEFAULTS["Read Only"].prRequest, false);
  assert.equal(ROLE_MODULE_DEFAULTS["Management Viewer"].addProject, false);
  assert.equal(ROLE_MODULE_DEFAULTS["PR Request User"].prRequest, true);
  assert.equal(ROLE_MODULE_DEFAULTS["PR Request User"].addProject, false, "PR Request User has no Projects access");
  assert.equal(ROLE_MODULE_DEFAULTS.Accounts.prRequest, true);
  assert.equal(ROLE_MODULE_DEFAULTS.Accounts.addProject, false, "Accounts has no Projects access");
  assert.equal(ROLE_MODULE_DEFAULTS["PMO Manager"].addProject && ROLE_MODULE_DEFAULTS["PMO Manager"].prRequest, true);
  for (const [role, modules] of Object.entries(ROLE_MODULE_DEFAULTS)) {
    if (modules.addProject) assert.ok(modules.projects, `${role}: Add Project only where Projects is held`);
    if (modules.prRequest) assert.ok(modules.approvals, `${role}: PR Request defaults only where Approvals was held`);
  }
});
