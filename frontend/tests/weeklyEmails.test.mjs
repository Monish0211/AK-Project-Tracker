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
