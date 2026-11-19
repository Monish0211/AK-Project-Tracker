// Project / PR Request document upload (Nov 2026): drag-and-drop + Browse in the shared Project Documents card (Add Project, Edit Project,
// PR Request), 100 MB per file, validation, duplicate prevention, per-file progress, retry / remove. Rendered server-side with the
// auth / toast stubs; the progress upload is exercised against a fake XMLHttpRequest (no network, no backend).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const stub = fileURLToPath(new URL("./stubs/authContextStub.ts", import.meta.url));
const toastStub = fileURLToPath(new URL("./stubs/toastStub.ts", import.meta.url));
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 };

let vite;
let load;
let React;
let renderToStaticMarkup;
before(async () => {
  vite = await createServer({
    root,
    resolve: {
      alias: [
        { find: /^(\.{1,2}\/)+(auth\/)?authContext$/, replacement: stub },
        { find: /^(\.{1,2}\/)+(components\/ui\/)?usePmoToast$/, replacement: toastStub },
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
});
after(() => vite?.close());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const MB = 1024 * 1024;
const f = (name, size, lastModified = 1) => ({ name, size, lastModified, type: "" });

describe("shared upload rules (Add Project, Edit Project and PR Request use the same module)", () => {
  test("100 MB per file: exactly 100 MB is accepted, one byte more is refused with the size in the message; empty files are refused", async () => {
    const u = await load("/src/utils/documentUpload.ts");
    assert.equal(u.DOCUMENT_MAX_FILE_SIZE_MB, 100);
    assert.equal(u.DOCUMENT_MAX_FILE_SIZE_BYTES, 100 * MB);
    assert.equal(u.documentFileProblem(f("drawing.pdf", 100 * MB)), null, "at the limit");
    assert.equal(u.documentFileProblem(f("drawing.pdf", 99 * MB)), null, "below the limit");
    assert.match(u.documentFileProblem(f("drawing.pdf", 100 * MB + 1)), /maximum is 100 MB per file/);
    assert.match(u.documentFileProblem(f("big.pdf", 150 * MB)), /150\.0 MB/);
    assert.match(u.documentFileProblem(f("empty.pdf", 0)), /empty/);
  });

  test("unsupported (executable / script) types are refused, case-insensitively; business documents are allowed", async () => {
    const u = await load("/src/utils/documentUpload.ts");
    for (const name of ["setup.exe", "RUN.BAT", "x.ps1", "a.js", "tool.jar", "s.sh", "lib.dll", "i.msi"]) {
      assert.match(u.documentFileProblem(f(name, 10)), /cannot be uploaded/, name);
    }
    for (const name of ["a.pdf", "b.docx", "c.xlsx", "d.png", "e.jpg", "f.dwg", "g.zip", "h.txt", "noextension"]) {
      assert.equal(u.documentFileProblem(f(name, 10)), null, name);
    }
    const backend = readFileSync(new URL("../../Backend/src/modules/documents/documents.constants.ts", import.meta.url), "utf8");
    for (const ext of u.DOCUMENT_BLOCKED_EXTENSIONS) assert.ok(backend.includes(`"${ext}"`), `${ext} mirrors the backend list`);
  });

  test("duplicates are skipped: the same file twice in one drop, a file already selected / uploading, and a document already stored", async () => {
    const u = await load("/src/utils/documentUpload.ts");
    const a = f("a.pdf", 10, 5);
    const sel = u.selectDocumentFiles([a, a, f("b.pdf", 20), f("bad.exe", 5), f("stored.pdf", 30)], new Set(), new Set(["stored.pdf|30"]));
    assert.deepEqual(sel.accepted.map((x) => x.name), ["a.pdf", "b.pdf"]);
    assert.deepEqual(sel.duplicates.map((x) => x.name), ["a.pdf", "stored.pdf"]);
    assert.deepEqual(sel.rejected.map((x) => x.file.name), ["bad.exe"]);
    const again = u.selectDocumentFiles([a], new Set([u.fileIdentity(a)]));
    assert.equal(again.accepted.length, 0, "a second drop of an already-selected file adds nothing");
    assert.equal(again.duplicates.length, 1);
  });
});

describe("progress upload (XMLHttpRequest)", () => {
  class FakeXhr {
    static last;
    constructor() {
      this.headers = {};
      this.upload = {};
      FakeXhr.last = this;
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(k, v) {
      this.headers[k] = v;
    }
    send(body) {
      this.body = body;
    }
  }

  test("sends the token and active country, reports progress, resolves the stored document, and allows a long transfer", async () => {
    globalThis.XMLHttpRequest = FakeXhr;
    const api = await load("/src/services/apiClient.ts");
    const docs = await load("/src/services/documentService.ts");
    api.setAccessToken("tkn");
    api.setActiveCountry("elixir-qatar");
    const seen = [];
    const file = new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" });
    const p = docs.uploadProjectDocument("p1", file, (pr) => seen.push(pr.percent));
    const x = FakeXhr.last;
    assert.equal(x.method, "POST");
    assert.match(x.url, /\/projects\/p1\/documents$/);
    assert.equal(x.headers["Authorization"], "Bearer tkn");
    assert.equal(x.headers["X-Active-Country"], "elixir-qatar");
    assert.equal(x.headers["Content-Type"], undefined, "the browser sets the multipart boundary");
    assert.equal(x.timeout, 15 * 60 * 1000, "a 100 MB file may take minutes");
    assert.ok(x.body instanceof FormData && x.body.get("file"));
    x.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 });
    x.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
    x.status = 201;
    x.responseText = JSON.stringify({ success: true, data: { id: "d1", fileName: "a.pdf" } });
    x.onload();
    assert.deepEqual(await p, { id: "d1", fileName: "a.pdf" });
    assert.deepEqual(seen, [25, 100]);
    api.setActiveCountry(null);
  });

  test("a server refusal keeps its message; a proxy's HTML 413 becomes a readable size message; timeouts and network errors are reported", async () => {
    globalThis.XMLHttpRequest = FakeXhr;
    const docs = await load("/src/services/documentService.ts");
    const file = new File(["x"], "a.pdf");
    let p = docs.uploadPRRequestDocument("r1", file);
    assert.match(FakeXhr.last.url, /\/pr-requests\/r1\/documents$/);
    FakeXhr.last.status = 413;
    FakeXhr.last.responseText = JSON.stringify({ success: false, message: "The file is larger than the 100 MB limit." });
    FakeXhr.last.onload();
    await assert.rejects(p, (e) => e.status === 413 && /100 MB limit/.test(e.message));

    p = docs.uploadPRRequestDocument("r1", file);
    FakeXhr.last.status = 413;
    FakeXhr.last.responseText = "<html><body>413 Request Entity Too Large</body></html>";
    FakeXhr.last.onload();
    await assert.rejects(p, (e) => e.status === 413 && /larger than the server accepts/.test(e.message));

    p = docs.uploadPRRequestDocument("r1", file);
    FakeXhr.last.ontimeout();
    await assert.rejects(p, (e) => e.isTimeout === true);
    p = docs.uploadPRRequestDocument("r1", file);
    FakeXhr.last.onerror();
    await assert.rejects(p, /Network error/);
  });
});

describe("the Project Documents card", () => {
  const render = async (props) => {
    const { default: Card } = await load("/src/pages/Projects/components/ProjectDocumentsCard.tsx");
    return renderToStaticMarkup(React.createElement(Card, { ownerType: "project", ownerId: null, ...props }));
  };

  test("Add Project / new PR Request (staging): a drop zone with Browse, multiple selection and the 100 MB limit shown", async () => {
    for (const ownerType of ["project", "prRequest"]) {
      const html = await render({ ownerType, onStageFile: () => undefined });
      assert.match(html, /data-testid="document-drop-zone"/, ownerType);
      assert.match(html, /Drag &amp; drop files here, or/);
      assert.match(html, /browse/);
      assert.match(html, /<input[^>]*type="file"[^>]*multiple/);
      assert.match(html, /Upload Document/, "the Browse / Upload Document button is kept");
      assert.match(html, /up to 100 MB per file/);
    }
  });

  test("staged files show name, size, status and progress, with Remove (and Retry when failed)", async () => {
    const file = new File([new Uint8Array(2048)], "Drawing A.pdf", { type: "application/pdf" });
    const html = await render({
      onStageFile: () => undefined,
      onRemoveStaged: () => undefined,
      onRetryStaged: () => undefined,
      pendingDocuments: [
        { localId: "1", file, status: "pending" },
        { localId: "2", file: new File([new Uint8Array(10)], "B.xlsx"), status: "uploading", progress: 42 },
        { localId: "3", file: new File([new Uint8Array(10)], "C.docx"), status: "failed", error: "Network error" },
      ],
    });
    assert.match(html, /Drawing A\.pdf/);
    assert.match(html, /2\.0 KB/);
    assert.match(html, /Pending upload/);
    assert.match(html, /Uploading 42%/);
    assert.match(html, /role="progressbar"[^>]*aria-valuenow="42"/);
    assert.match(html, /Failed — Network error/);
    assert.match(html, /title="Retry upload"/);
    assert.equal((html.match(/title="Remove"/g) ?? []).length, 2, "Remove on pending and failed rows, not on the one uploading");
  });

  test("view-only and locked states have no drop zone (unchanged)", async () => {
    assert.doesNotMatch(await render({ ownerId: "p1", readOnly: true }), /document-drop-zone/);
    const locked = await render({ ownerType: "prRequest", lockedMessage: "Save first." });
    assert.match(locked, /Documents locked/);
    assert.doesNotMatch(locked, /document-drop-zone/);
  });

  test("wiring: drop handling, sequential direct uploads, and both forms report per-file progress", () => {
    const card = src("pages/Projects/components/ProjectDocumentsCard.tsx");
    assert.match(card, /onDrop:/);
    assert.match(card, /dataTransfer\.files/);
    assert.match(card, /if \(!target \|\| runningRef\.current\) return;/, "one direct upload at a time: a single runner");
    assert.match(card, /runningRef\.current = false;\s*runQueue\(target\);/, "the runner continues with the next queued file");
    assert.match(card, /selectDocumentFiles\(/);
    for (const form of ["pages/Projects/components/ProjectForm.tsx", "pages/PRRequests/RequestPRForm.tsx"]) {
      assert.match(src(form), /Document\((?:projectId|prRequestId), doc\.file, \(\{ percent \}\)/, form);
    }
    assert.match(src("services/documentService.ts"), /getBlob\(`\/documents\/\$\{documentId\}\/download`, \{ timeoutMs: DOCUMENT_TRANSFER_TIMEOUT_MS \}\)/, "large downloads get the long timeout too");
  });
});
