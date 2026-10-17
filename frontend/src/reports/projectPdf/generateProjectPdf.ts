/**
 * Runs the Project Financial Report build in a module Web Worker so the
 * CPU-heavy work (table layout + serialization, ~0.5–1 s for ~1,000
 * invoices) never blocks the page.
 *
 * Lifecycle: one shared worker, created on the first export, reused for
 * exports close together (its JIT-compiled code stays warm), and terminated
 * after WORKER_IDLE_MS without work so its memory is released.
 *
 * Falls back to building on the main thread — the previous behaviour — only
 * when a worker cannot be created or the worker itself fails (e.g. a browser
 * without module-worker support); a genuine build error is reported, not
 * retried.
 */
import type { ProjectReportData } from "../../services/projectReportDataService";
import type { ProjectPdfTimings } from "./buildProjectFinancialPdf";
import type { ProjectPdfWorkerRequest, ProjectPdfWorkerResponse } from "./projectPdfWorkerTypes";

export interface GeneratedProjectPdf {
  blob: Blob;
  filename: string;
  pageCount: number;
  invoiceAvailable: boolean;
  textReplaced: boolean;
  timings: ProjectPdfTimings;
  /** "worker" normally; "main-thread" only on the fallback path. */
  mode: "worker" | "main-thread";
}

const WORKER_TIMEOUT_MS = 60_000;
const WORKER_IDLE_MS = 60_000;

class WorkerUnavailableError extends Error {}

interface Pending {
  resolve: (result: GeneratedProjectPdf) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function disposeWorker(reason?: Error): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  worker?.terminate();
  worker = null;
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(reason ?? new WorkerUnavailableError("PDF worker stopped"));
    pending.delete(id);
  }
}

function scheduleIdleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = pending.size === 0 ? setTimeout(() => disposeWorker(), WORKER_IDLE_MS) : null;
}

function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./projectPdf.worker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<ProjectPdfWorkerResponse>) => {
    const res = event.data;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    clearTimeout(p.timer);
    scheduleIdleShutdown();
    if (!res.ok) {
      p.reject(new Error(res.message));
      return;
    }
    p.resolve({
      blob: new Blob([res.buffer], { type: "application/pdf" }),
      filename: res.filename,
      pageCount: res.pageCount,
      invoiceAvailable: res.invoiceAvailable,
      textReplaced: res.textReplaced,
      timings: res.timings,
      mode: "worker",
    });
  };
  // Script load/parse failures (unsupported module workers, blocked chunk) surface here.
  created.onerror = (event) => {
    event.preventDefault();
    disposeWorker(new WorkerUnavailableError(event.message || "PDF worker failed to start"));
  };
  worker = created;
  return created;
}

function buildInWorker(data: ProjectReportData): Promise<GeneratedProjectPdf> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = getWorker();
    } catch (err) {
      reject(new WorkerUnavailableError(err instanceof Error ? err.message : String(err)));
      return;
    }
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    const id = nextId++;
    const timer = setTimeout(() => {
      // A hung worker is replaced; this export falls back to the main thread.
      disposeWorker(new WorkerUnavailableError("PDF worker timed out"));
    }, WORKER_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    const request: ProjectPdfWorkerRequest = { id, data };
    w.postMessage(request);
  });
}

async function buildOnMainThread(data: ProjectReportData): Promise<GeneratedProjectPdf> {
  const { buildProjectFinancialPdf } = await import("./buildProjectFinancialPdf");
  const built = buildProjectFinancialPdf(data);
  return {
    blob: built.blob ?? new Blob([built.bytes as BlobPart], { type: "application/pdf" }),
    filename: built.filename,
    pageCount: built.pageCount,
    invoiceAvailable: built.financials.invoice !== null,
    textReplaced: built.textReplaced,
    timings: built.timings,
    mode: "main-thread",
  };
}

export async function generateProjectPdf(data: ProjectReportData): Promise<GeneratedProjectPdf> {
  if (typeof Worker === "undefined") return buildOnMainThread(data);
  try {
    return await buildInWorker(data);
  } catch (err) {
    if (err instanceof WorkerUnavailableError) {
      console.warn("PDF worker unavailable, building on the main thread:", err.message);
      return buildOnMainThread(data);
    }
    throw err;
  }
}
