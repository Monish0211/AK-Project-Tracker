// Project Repository Invoice Status (Oct 2026): "Paid" needs the Work Order Value fully invoiced AND every non-Cancelled invoice
// actually Paid. Fully invoiced alone (e.g. PR-12005: ₹1,32,000 Paid + ₹33,000 Raised = ₹1,65,000) is "Partially Paid".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let rule;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  ({ repositoryInvoiceSummary: rule } = await vite.ssrLoadModule("/src/utils/repositoryInvoiceStatus.ts"));
});
after(() => vite?.close());

const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n"); // checkouts may use CRLF
const status = (wo, pendingDue, allPaid) => rule(wo, pendingDue, allPaid).invoiceStatus;

test("PR-12005: ₹1,65,000 fully invoiced, but ₹33,000 is still Raised / Submitted → Partially Paid, not Paid", () => {
  // server figures: workOrderValueINR 165000, pendingDueINR 0 (1,32,000 + 33,000 invoiced), allInvoicesPaid false
  assert.deepEqual(rule(165000, 0, false), { pendingDue: 0, invoiceStatus: "Partially Paid" });
});

test("fully invoiced AND every invoice Paid → Paid", () => {
  assert.deepEqual(rule(165000, 0, true), { pendingDue: 0, invoiceStatus: "Paid" });
});

test("nothing invoiced stays Not Started, whatever the flag says", () => {
  assert.equal(status(165000, 165000, false), "Not Started");
  assert.equal(status(165000, 165000, true), "Not Started");
  assert.equal(status(165000, 165000, undefined), "Not Started");
  assert.equal(status(165000, undefined, false), "Not Started", "no server figure → nothing invoiced");
  assert.equal(status(0, 0, true), "Not Started", "no Work Order Value → nothing to be invoiced");
});

test("partly invoiced keeps the existing Partially Paid rule — even if every invoice so far is Paid", () => {
  assert.equal(status(165000, 33000, false), "Partially Paid");
  assert.equal(status(165000, 33000, true), "Partially Paid", "paid invoices do not make an under-invoiced project Paid");
  assert.deepEqual(rule(165000, 33000, true), { pendingDue: 33000, invoiceStatus: "Partially Paid" });
});

test("a caller that supplies no per-invoice information keeps the original invoiced-share rule (the Invoice Tracker list)", () => {
  assert.equal(status(165000, 0, undefined), "Paid");
  assert.equal(status(165000, 0), "Paid");
  assert.equal(status(165000, 33000), "Partially Paid");
  assert.equal(status(165000, 165000), "Not Started");
});

test("the Project Repository always supplies the flag explicitly, so a missing server flag is never shown as Paid", () => {
  assert.match(src("pages/Projects/Projects.tsx"), /p\.backendAllInvoicesPaid === true/);
  assert.equal(status(165000, 0, false), "Partially Paid");
});

test("the committed Invoice Tracker call (two arguments) is untouched", () => {
  assert.deepEqual(rule(1000, 0), { pendingDue: 0, invoiceStatus: "Paid" });
  assert.deepEqual(rule(1000, -50), { pendingDue: -50, invoiceStatus: "Paid" });
  assert.deepEqual(rule(undefined, undefined), { pendingDue: 0, invoiceStatus: "Not Started" });
});

test("Pending Due is unchanged by the Paid guard", () => {
  assert.equal(rule(165000, 0, false).pendingDue, 0);
  assert.equal(rule(165000, 0, true).pendingDue, 0);
  assert.equal(rule(165000, 33000, false).pendingDue, 33000);
  assert.equal(rule(165000, undefined, undefined).pendingDue, 165000);
});

test("the Repository passes the server's flag to the rule, and the API field is carried through the project mapping", () => {
  assert.match(src("pages/Projects/Projects.tsx"), /repositoryInvoiceSummary\(p\.workOrderValueINR, p\.backendPendingDueINR, p\.backendAllInvoicesPaid === true\)/);
  assert.match(src("services/projectService.ts"), /backendAllInvoicesPaid: dto\.allInvoicesPaid/);
  assert.match(src("types/Project.ts"), /backendAllInvoicesPaid\?: boolean/);
});
