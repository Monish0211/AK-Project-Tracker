// Non Man-Hour Budget Amount (Phase 1): "not entered" is NULL, "entered as 0" is 0, a positive amount is that amount.
// ROOT CAUSE this guards against: createEmptyProject() defaulted the field to 0, the Expense Budget input turned a blank into 0 (`parseFloat(v) || 0`)
// and hid a real 0 (`value || ""`), and a NULL loaded from the backend became `undefined`, which the JSON project cache drops - normalizeProject() then
// restored the default 0. The weekly missing-expenses email (a later phase) needs to tell blank from zero.
// The real createProject/updateProject/load code runs below against a fake fetch that stores exactly what it is sent, like the backend does (it accepts null).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};

globalThis.window = { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };

let requests = [];
let serverRow = null; // the "database row": what the last POST/PATCH stored
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : {};
  requests.push({ url: String(url), method: init.method ?? "GET", body });
  // Same semantics as the backend: POST stores the sent fields (absent -> null); PATCH writes a field only when it is sent (null clears it).
  if (init.method === "POST") serverRow = { id: "p-1", isDeleted: false, createdAt: "2026-10-30T00:00:00.000Z", updatedAt: "2026-10-30T00:00:00.000Z", nonManhourBudgetAmount: null, ...body };
  else serverRow = { ...serverRow, ...body };
  return new Response(JSON.stringify({ success: true, data: serverRow }), { status: 200, headers: { "content-type": "application/json" } });
};

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      {
        name: "stub-notification-service",
        enforce: "pre",
        load(id) {
          if (id.split("\\").join("/").endsWith("/src/notifications/notificationService.ts")) {
            return "export const notificationService = new Proxy({}, { get: () => () => undefined });";
          }
          return null;
        },
      },
    ],
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => {
  globalThis.fetch = realFetch;
  return vite?.close();
});
beforeEach(() => {
  mem.clear();
  requests = [];
  serverRow = null;
});

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

async function blankProject(over = {}) {
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  return { ...createEmptyProject(), prNo: "PR-9001", client: "Acme", projectTitle: "Budget test", ...over };
}
const lastBody = () => requests[requests.length - 1].body;

// What the Expense Budget input's onChange does to the project, using the card's own handler.
async function typeIntoBudgetInput(project, raw) {
  const { default: ExpenseBudgetCard } = await load("/src/pages/Projects/components/ExpenseBudgetCard.tsx");
  let next = project;
  const tree = ExpenseBudgetCard({ project, setProject: (updater) => (next = typeof updater === "function" ? updater(next) : updater) });
  const find = (node) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const n of node) { const f = find(n); if (f) return f; }
      return null;
    }
    if (node.props?.placeholder === "Enter Non Man-Hour Budget Amount") return node;
    return find(node.props?.children);
  };
  const input = find(tree);
  assert.ok(input, "the Non Man-Hour Budget Amount input must be in the card");
  input.props.onChange({ target: { value: raw } });
  return { next, shownValue: input.props.value };
}
async function shownValue(project) {
  const { default: ExpenseBudgetCard } = await load("/src/pages/Projects/components/ExpenseBudgetCard.tsx");
  const find = (node) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) { for (const n of node) { const f = find(n); if (f) return f; } return null; }
    if (node.props?.placeholder === "Enter Non Man-Hour Budget Amount") return node;
    return find(node.props?.children);
  };
  return find(ExpenseBudgetCard({ project, setProject() {} })).props.value;
}

// ---- the helper -------------------------------------------------------------------------------------------------------------

test("helper: blank and non-numeric are null, zero is zero, positive stays positive; display never hides a zero", async () => {
  const { parseBudgetInput, budgetInputValue, budgetAmountForPayload } = await load("/src/utils/budgetAmount.ts");
  for (const blank of ["", "   ", "abc"]) assert.equal(parseBudgetInput(blank), null, JSON.stringify(blank));
  assert.equal(parseBudgetInput("0"), 0);
  assert.equal(parseBudgetInput("0.00"), 0);
  assert.equal(parseBudgetInput("62500"), 62500);
  assert.equal(parseBudgetInput("1250.5"), 1250.5);
  assert.equal(budgetInputValue(null), "");
  assert.equal(budgetInputValue(undefined), "");
  assert.equal(budgetInputValue(0), 0, "an explicit zero must stay visible");
  assert.equal(budgetInputValue(62500), 62500);
  assert.equal(budgetAmountForPayload(null), null);
  assert.equal(budgetAmountForPayload(undefined), null);
  assert.equal(budgetAmountForPayload(0), 0);
  assert.equal(budgetAmountForPayload(62500), 62500);
  assert.equal(budgetAmountForPayload(NaN), null, "NaN must never reach the API");
});

// ---- new project ------------------------------------------------------------------------------------------------------------

test("a new project starts with the budget NOT entered (null, not 0)", async () => {
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  assert.equal(createEmptyProject().nonManhourBudgetAmount, null);
});

test("new project, budget untouched -> POST sends an explicit null", async () => {
  const { createProjectGeneralInfo } = await load("/src/services/projectService.ts");
  await createProjectGeneralInfo(await blankProject());
  assert.equal(requests[0].method, "POST");
  assert.ok("nonManhourBudgetAmount" in lastBody(), "the key must be present so the intent is explicit");
  assert.equal(lastBody().nonManhourBudgetAmount, null);
  assert.equal(serverRow.nonManhourBudgetAmount, null, "stored as NULL");
});

test("user types 0 -> POST sends 0; the field then shows 0", async () => {
  const { createProjectGeneralInfo } = await load("/src/services/projectService.ts");
  const { next, shownValue: before } = await typeIntoBudgetInput(await blankProject(), "0");
  assert.equal(before, "", "untouched field shows empty");
  assert.equal(next.nonManhourBudgetAmount, 0);
  assert.equal(await shownValue(next), 0, "an explicit zero is displayed, not hidden");
  await createProjectGeneralInfo(next);
  assert.equal(lastBody().nonManhourBudgetAmount, 0);
  assert.equal(serverRow.nonManhourBudgetAmount, 0);
});

test("user types 62500 -> POST sends 62500 and it displays as 62500", async () => {
  const { createProjectGeneralInfo } = await load("/src/services/projectService.ts");
  const { next } = await typeIntoBudgetInput(await blankProject(), "62500");
  assert.equal(await shownValue(next), 62500);
  await createProjectGeneralInfo(next);
  assert.equal(lastBody().nonManhourBudgetAmount, 62500);
});

// ---- editing ----------------------------------------------------------------------------------------------------------------

test("clearing a previously entered amount -> PATCH sends an explicit null (never 0)", async () => {
  const { createProjectGeneralInfo, updateProjectGeneralInfo } = await load("/src/services/projectService.ts");
  const created = await createProjectGeneralInfo((await typeIntoBudgetInput(await blankProject(), "62500")).next);
  assert.equal(serverRow.nonManhourBudgetAmount, 62500);
  const { next } = await typeIntoBudgetInput(created, "");
  assert.equal(next.nonManhourBudgetAmount, null);
  assert.equal(await shownValue(next), "");
  await updateProjectGeneralInfo(created.id, next);
  assert.equal(requests[requests.length - 1].method, "PATCH");
  assert.ok("nonManhourBudgetAmount" in lastBody());
  assert.equal(lastBody().nonManhourBudgetAmount, null);
  assert.equal(serverRow.nonManhourBudgetAmount, null);
});

for (const [label, amount] of [["NULL", null], ["0", 0], ["62500", 62500]]) {
  test(`editing an unrelated field keeps an existing ${label} budget unchanged (PATCH + cache round trip)`, async () => {
    const { createProjectGeneralInfo, updateProjectGeneralInfo, getProjects } = await load("/src/services/projectService.ts");
    const { next } = amount === null ? { next: await blankProject() } : await typeIntoBudgetInput(await blankProject(), String(amount));
    const created = await createProjectGeneralInfo(next);
    assert.equal(serverRow.nonManhourBudgetAmount, amount);
    // The Edit page loads from the JSON-backed project cache, then the user changes a different field and saves.
    const cached = getProjects().find((p) => p.id === created.id);
    assert.equal(cached.nonManhourBudgetAmount, amount, "hydrated from the cache exactly as stored (NULL must not become 0)");
    await updateProjectGeneralInfo(created.id, { ...cached, projectTitle: "Renamed" });
    assert.equal(lastBody().projectTitle, "Renamed");
    assert.equal(lastBody().nonManhourBudgetAmount, amount);
    assert.equal(serverRow.nonManhourBudgetAmount, amount);
    assert.equal(getProjects().find((p) => p.id === created.id).nonManhourBudgetAmount, amount);
  });
}

// ---- hydration from the backend -----------------------------------------------------------------------------------------------

test("loading a project row hydrates NULL as null, 0 as 0 and a positive amount as itself - also after the JSON cache round trip", async () => {
  const { createProjectGeneralInfo, getProjects } = await load("/src/services/projectService.ts");
  for (const amount of [null, 0, 62500, 1250.5]) {
    mem.clear();
    const project = await blankProject();
    project.nonManhourBudgetAmount = amount;
    const merged = await createProjectGeneralInfo(project);
    assert.equal(merged.nonManhourBudgetAmount, amount, `merged ${amount}`);
    assert.equal(getProjects().find((p) => p.id === merged.id).nonManhourBudgetAmount, amount, `cached ${amount}`);
    assert.equal(await shownValue(merged), amount === null ? "" : amount, `shown ${amount}`);
  }
});

test("a legacy cached project saved without the field no longer gains a phantom 0", async () => {
  const { normalizeProject } = await load("/src/services/projectService.ts");
  const project = await blankProject();
  delete project.nonManhourBudgetAmount; // what JSON.stringify did to `undefined` before this fix
  assert.equal(normalizeProject(project).nonManhourBudgetAmount, null);
});

// ---- other workflows ----------------------------------------------------------------------------------------------------------

test("PR Request drafts: null stays null and 0 stays 0, both when saving the draft and when loading it", async () => {
  const { projectToDraftPayload, draftPayloadToProject } = await load("/src/pages/PRRequests/draftMapping.ts");
  for (const amount of [null, 0, 62500]) {
    const project = await blankProject();
    project.nonManhourBudgetAmount = amount;
    const payload = projectToDraftPayload(project);
    assert.equal(payload.nonManhourBudgetAmount, amount, `payload ${amount}`);
    const loaded = draftPayloadToProject(await blankProject(), payload);
    assert.equal(loaded.nonManhourBudgetAmount, amount, `loaded ${amount}`);
  }
});

test("Excel import builds on createEmptyProject() and never sets this field, so an imported project inherits null", () => {
  const workbook = src("services/projectWorkbookService.ts");
  assert.ok(!workbook.includes("nonManhourBudgetAmount"), "the workbook service must not assign the field");
  assert.ok(workbook.includes("...createEmptyProject()"), "imported projects start from the empty-project defaults");
});

// ---- scope guard ----------------------------------------------------------------------------------------------------------------

test("only the Non Man-Hour amount changed: the Man-Hour twin and the payload shape are untouched", async () => {
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  assert.equal(createEmptyProject().manhourBudgetAmount, 0, "Man-Hour Budget Amount is a separate field and keeps its existing default");
  const card = src("pages/Projects/components/ExpenseBudgetCard.tsx");
  assert.ok(card.includes("manhourBudgetAmount: parseFloat(e.target.value) || 0"), "Man-Hour handler unchanged");
  assert.ok(!card.includes("nonManhourBudgetAmount: parseFloat(e.target.value) || 0"), "the `|| 0` coercion is gone for Non Man-Hour");
});
