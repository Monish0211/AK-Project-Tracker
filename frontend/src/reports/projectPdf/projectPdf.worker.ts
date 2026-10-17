/// <reference lib="webworker" />
/**
 * Builds the Project Financial Report PDF off the main thread (Oct 2026).
 * jsPDF, jspdf-autotable and the builder need no DOM, so the CPU-heavy
 * layout and serialization run here while the page stays responsive.
 * generateProjectPdf.ts owns this worker's lifecycle (reused while exports
 * are close together, terminated when idle). Every response echoes its
 * request id; the PDF bytes are transferred, not copied.
 */
import { buildProjectFinancialPdf } from "./buildProjectFinancialPdf";
import type { ProjectPdfWorkerRequest, ProjectPdfWorkerResponse } from "./projectPdfWorkerTypes";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<ProjectPdfWorkerRequest>) => {
  const { id, data, timeZone } = event.data;
  try {
    const built = buildProjectFinancialPdf(data, { timeZone });
    const buffer = built.bytes.buffer as ArrayBuffer;
    const response: ProjectPdfWorkerResponse = {
      id,
      ok: true,
      buffer,
      filename: built.filename,
      pageCount: built.pageCount,
      invoiceAvailable: built.financials.invoice !== null,
      textReplaced: built.textReplaced,
      timings: built.timings,
    };
    scope.postMessage(response, [buffer]);
  } catch (err) {
    const response: ProjectPdfWorkerResponse = { id, ok: false, message: err instanceof Error ? err.message : String(err) };
    scope.postMessage(response);
  }
};
