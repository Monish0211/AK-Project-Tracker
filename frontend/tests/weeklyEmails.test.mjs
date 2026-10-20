// Settings → Weekly Emails (Oct 2026) — client-side recipient checks, which
// mirror the backend's validateRecipients (the backend stays the authority).
// Run: npm test (node:test + Vite's SSR module loader, same harness as the
// other frontend tests).
import assert from "node:assert/strict";
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

test("recipientError: valid To + CC passes; invalid, duplicate and CC-equals-To are reported", async () => {
  const { recipientError, isValidEmailAddress } = await load("/src/services/weeklyEmailService.ts");
  assert.equal(recipientError("info@ifluids.com", ["sivagnanam@ifluids.com", "monish.n@ifluids.com"]), null);
  assert.equal(recipientError("", []), "The To address is required.");
  assert.match(recipientError("info@", []), /not a valid email/);
  assert.match(recipientError("info@ifluids.com", ["a@ifluids.com", "A@IFLUIDS.COM"]), /more than once/);
  assert.match(recipientError("info@ifluids.com", ["Info@Ifluids.com"]), /more than once/);
  assert.match(recipientError("info@ifluids.com", ["no-at-sign"]), /not a valid email/);
  assert.equal(isValidEmailAddress(" name@ifluids.com "), true);
  assert.equal(isValidEmailAddress("name@ifluids"), false);
});

test("run status labels cover every backend status", async () => {
  const { RUN_STATUS_LABELS } = await load("/src/services/weeklyEmailService.ts");
  for (const s of ["RUNNING", "SENDING", "SENT", "FAILED", "NO_MISSING", "DISABLED", "DELIVERY_UNKNOWN", "INTERRUPTED"]) {
    assert.ok(RUN_STATUS_LABELS[s], s);
  }
  const { SKIP_REASON_LABELS } = await load("/src/services/weeklyEmailService.ts");
  for (const r of ["already_completed", "in_progress", "delivery_unknown"]) assert.ok(SKIP_REASON_LABELS[r], r);
});

test("each weekly notification card talks only to its own API path", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { missingExpenseEmailApi, unpaidInvoiceEmailApi } = await load("/src/services/weeklyEmailService.ts");
  const calls = [];
  const orig = { get: apiClient.get, put: apiClient.put, post: apiClient.post };
  apiClient.get = async (path) => (calls.push(["GET", path]), path.endsWith("/user-options") ? { items: [] } : {});
  apiClient.put = async (path, body) => (calls.push(["PUT", path, body]), {});
  apiClient.post = async (path, body) => (calls.push(["POST", path, body]), {});
  try {
    await unpaidInvoiceEmailApi.getSettings();
    await unpaidInvoiceEmailApi.getUserOptions();
    await unpaidInvoiceEmailApi.saveRecipients("ar@example.com", [{ email: "fin@example.com", portalUserId: null }]);
    await unpaidInvoiceEmailApi.preview();
    await unpaidInvoiceEmailApi.run("manual");
    await unpaidInvoiceEmailApi.previewPage(1, 25);
    await unpaidInvoiceEmailApi.runs(1, 25);
    await missingExpenseEmailApi.getSettings();
  } finally {
    Object.assign(apiClient, orig);
  }
  assert.deepEqual(calls.map((c) => `${c[0]} ${c[1]}`), [
    "GET /notification-settings/unpaid-invoices",
    "GET /notification-settings/unpaid-invoices/user-options",
    "PUT /notification-settings/unpaid-invoices",
    "POST /notification-settings/unpaid-invoices/preview",
    "POST /notification-settings/unpaid-invoices/run",
    "GET /notification-settings/unpaid-invoices/preview?page=1&pageSize=25",
    "GET /notification-settings/unpaid-invoices/runs?page=1&pageSize=25",
    "GET /notification-settings/missing-expenses",
  ]);
  assert.deepEqual(calls[2][2], { toEmail: "ar@example.com", cc: [{ email: "fin@example.com", portalUserId: null }] });
  assert.deepEqual(calls[4][2], { mode: "manual" });
});
