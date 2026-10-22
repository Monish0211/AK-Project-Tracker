// "pmo:data-changed" batching (Oct 2026 performance audit): a screen that loads / saves in several steps announces ONCE, not once per
// step — each announcement re-runs the app-wide listeners (notification rules, sidebar counts…), which was the measured cost of opening
// Edit Project (7 announcements), opening an invoice from Invoice Tracker (4) and saving one (5).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
const seen = [];
before(async () => {
  globalThis.window = { dispatchEvent: (e) => (seen.push(e.detail), true), addEventListener() {}, removeEventListener() {} };
  vite = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true, include: [] } });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());
beforeEach(() => { seen.length = 0; });

const UTIL = "/src/utils/pmoDataChanged.ts";
const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");

test("outside a batch every announcement goes out immediately, exactly as before", async () => {
  const { dispatchPmoDataChanged } = await load(UTIL);
  dispatchPmoDataChanged({ entity: "project" });
  dispatchPmoDataChanged({ entity: "project", ids: ["a"] });
  assert.deepEqual(seen, [{ entity: "project" }, { entity: "project", ids: ["a"] }]);
});

test("inside a batch, many announcements of one kind become ONE when the batch settles — and not before", async () => {
  const { batchPmoDataChanged, dispatchPmoDataChanged } = await load(UTIL);
  let midway = -1;
  const result = await batchPmoDataChanged(async () => {
    for (let i = 0; i < 7; i++) {
      dispatchPmoDataChanged({ entity: "project" });
      await Promise.resolve();
    }
    midway = seen.length;
    return "loaded";
  });
  assert.equal(result, "loaded", "the batch returns what the work returned");
  assert.equal(midway, 0, "nothing is announced while the work is still going");
  assert.deepEqual(seen, [{ entity: "project" }], "…and one announcement when it ends");
});

test("each kind of change is announced once; ids merge; an announcement without ids stays 'unknown which' so no filtering listener misses it", async () => {
  const { batchPmoDataChanged, dispatchPmoDataChanged } = await load(UTIL);
  await batchPmoDataChanged(async () => {
    dispatchPmoDataChanged({ entity: "project", ids: ["a"] });
    dispatchPmoDataChanged({ entity: "timesheet" });
    dispatchPmoDataChanged({ entity: "project", ids: ["b", "a"] });
  });
  assert.deepEqual(seen.map((d) => d.entity).sort(), ["project", "timesheet"]);
  assert.deepEqual(seen.find((d) => d.entity === "project").ids.sort(), ["a", "b"]);
  seen.length = 0;
  await batchPmoDataChanged(async () => {
    dispatchPmoDataChanged({ entity: "project", ids: ["a"] });
    dispatchPmoDataChanged({ entity: "project" });
  });
  assert.deepEqual(seen, [{ entity: "project" }], "one of them did not say which — so the merged one does not claim to");
});

test("a failing batch still announces what changed before it failed, and rethrows; nested batches announce only at the outermost end; an empty batch announces nothing", async () => {
  const { batchPmoDataChanged, dispatchPmoDataChanged } = await load(UTIL);
  await assert.rejects(batchPmoDataChanged(async () => { dispatchPmoDataChanged({ entity: "project" }); throw new Error("boom"); }), /boom/);
  assert.deepEqual(seen, [{ entity: "project" }], "the mirror was written before the failure, so listeners are still told");
  seen.length = 0;
  await batchPmoDataChanged(async () => {
    await batchPmoDataChanged(async () => dispatchPmoDataChanged({ entity: "project" }));
    assert.equal(seen.length, 0, "the inner batch ending is not the end");
    dispatchPmoDataChanged({ entity: "project" });
  });
  assert.equal(seen.length, 1);
  seen.length = 0;
  await batchPmoDataChanged(async () => undefined);
  assert.deepEqual(seen, []);
  dispatchPmoDataChanged({ entity: "reminder" });
  assert.deepEqual(seen, [{ entity: "reminder" }], "and the depth is back to zero afterwards: announcements are immediate again");
});

test("the screens that make several mirror writes in a row use it: Edit Project's load, the Tracker's invoice-context load, and an invoice save", () => {
  assert.match(src("pages/Projects/EditProject.tsx"), /batchPmoDataChanged\(\(\) => fetchProjectByIdFromApi\(id, \{ includeResources: false \}\)/);
  assert.match(src("services/invoiceTrackerService.ts"), /batchPmoDataChanged\(\(\) =>\s+Promise\.all\(\[/);
  assert.match(src("pages/Projects/components/Invoice/invoiceLineActions.ts"), /void batchPmoDataChanged\(\(\) =>\s+deps/);
});

test("Delete from Invoice Tracker: the confirmation is on screen at once and is only held back (disabled) until the project it acts on has loaded", () => {
  const host = src("pages/InvoiceTracker/InvoiceActionHost.tsx");
  assert.match(host, /!load\.data && action\.mode === "delete"[^]*?<ConfirmDialog open variant="danger" title="Delete Invoice\?"[^]*?confirmDisabled/);
  assert.match(host, /load\.error && !load\.data/, "a failed load is still reported with a retry, before any dialog");
  const dialog = src("components/ui/ConfirmDialog.tsx");
  assert.match(dialog, /confirmDisabled\?: boolean/);
  assert.match(dialog, /onClick=\{onConfirm\} disabled=\{confirmDisabled\}/, "a disabled confirm cannot fire");
});
