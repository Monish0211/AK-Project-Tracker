import { createWorker } from "tesseract.js";
import type { Worker } from "tesseract.js";

/**
 * A single Tesseract worker, created lazily on first use and reused across
 * every page of an extraction — and across multiple PDF imports in the
 * same browser session — rather than spun up fresh per page. Worker
 * creation loads the English language model, which is real, avoidable
 * latency if paid on every page; this is the main OCR-side performance
 * optimization in this pipeline (see pdfExtraction/index.ts, which only
 * ever calls into this file for pages pdfReader.ts already flagged as
 * needing OCR — a fully digital PDF never touches this file at all).
 */
let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
}

export interface OcrResult {
  text: string;
  /** Tesseract's own recognition confidence (0-100) for this page's image — a signal about image/OCR quality, independent of the Rule Engine's separate per-field confidence scoring (confidenceScoring.ts). */
  confidence: number;
}

/** Runs OCR on one rendered page canvas. Never throws on a single bad page — callers should catch per-page so one unreadable scanned page doesn't abort the whole document (see pdfExtraction/index.ts). */
export async function recognizeCanvas(canvas: HTMLCanvasElement): Promise<OcrResult> {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  return { text: data.text ?? "", confidence: data.confidence ?? 0 };
}

/** Explicit opt-in cleanup (e.g. on app/tab teardown) — not called automatically after every extraction, since keeping the worker warm across imports in the same session is the whole point of the module-level singleton above. */
export async function terminateOcrEngine(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = null;
}
