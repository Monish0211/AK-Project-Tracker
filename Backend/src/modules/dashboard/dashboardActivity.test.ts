import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildActivity, paidAmountLabel } from "./services/dashboard.service.js";
import type { DashboardProjectRow, InvoiceLineRow, NoteRow } from "./repository/dashboard.repository.js";

/**
 * The dashboard's recent-activity feed. buildActivity() was optimized (rank cheap numeric timestamps first, build the text only for the ten that are returned);
 * this test pins that the result is IDENTICAL to the original algorithm, copied below as the reference, on randomized data that includes tied timestamps, unreadable
 * dates, Cancelled / Paid / Draft lines, notes of unknown projects, India (INR) and another country's (OMR) lines.
 */
type ActivityEvent = { id: string; category: string; title: string; description: string; projectRef: string; timestamp: string };

function isoOrEmpty(date: Date): string {
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** The algorithm exactly as it was before the optimization. */
function referenceBuildActivity(projects: DashboardProjectRow[], notes: NoteRow[], invoiceByProject: Map<string, InvoiceLineRow[]>): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const projectById = new Map(projects.map((p) => [p.id, p]));
  for (const project of projects) {
    events.push({ id: `${project.id}-created`, category: "Project", title: "Project Created", description: `${project.projectTitle || project.prNo} added for ${project.client || "client"}.`, projectRef: project.prNo, timestamp: project.createdAt.toISOString() });
    if (project.updatedAt.getTime() !== project.createdAt.getTime()) {
      events.push({ id: `${project.id}-updated`, category: "Project", title: "Project Updated", description: `${project.projectTitle || project.prNo} details were updated.`, projectRef: project.prNo, timestamp: project.updatedAt.toISOString() });
    }
    for (const line of invoiceByProject.get(project.id) ?? []) {
      if (line.status === "Cancelled") continue;
      events.push({ id: `invoice-${line.id}`, category: "Invoice", title: "Invoice Raised", description: `${line.invoiceNo} raised for ${project.client || project.prNo}.`, projectRef: project.prNo, timestamp: isoOrEmpty(line.invoiceDate) });
      if (line.status === "Paid") {
        events.push({ id: `payment-${line.id}`, category: "Payment", title: "Payment Received", description: `${project.client || project.prNo} paid ${paidAmountLabel(line)} against ${line.invoiceNo}.`, projectRef: project.prNo, timestamp: isoOrEmpty(line.invoiceDate) });
      }
    }
  }
  for (const note of notes) {
    const project = projectById.get(note.projectId);
    if (!project) continue;
    events.push({ id: `note-${note.id}`, category: "Notes", title: "Project Note Added", description: note.message, projectRef: project.prNo, timestamp: note.createdAt.toISOString() });
  }
  return events
    .filter((event) => !!event.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);
}

// A tiny deterministic generator so a failure is reproducible.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dataset(seed: number) {
  const r = rng(seed);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)]!;
  // few distinct instants, so ties are common
  const instants = [Date.UTC(2026, 0, 5), Date.UTC(2026, 2, 9), Date.UTC(2026, 4, 1), Date.UTC(2026, 6, 20), Date.UTC(2026, 9, 3), Date.UTC(2026, 10, 12)];
  const date = (): Date => (r() < 0.04 ? new Date(Number.NaN) : new Date(pick(instants) + Math.floor(r() * 3) * 1000));
  const nProjects = 1 + Math.floor(r() * 14);
  const projects: DashboardProjectRow[] = [];
  const invoiceByProject = new Map<string, InvoiceLineRow[]>();
  const notes: NoteRow[] = [];
  for (let i = 0; i < nProjects; i++) {
    const createdAt = new Date(pick(instants));
    const regional = r() < 0.5;
    const p = {
      id: `p${i}`,
      prNo: `PR-${seed}-${i}`,
      client: r() < 0.2 ? "" : `Client ${i % 3}`,
      department: "Process",
      projectTitle: r() < 0.2 ? "" : `Title ${i}`,
      projectStatus: "Active",
      projectStartDate: new Date(pick(instants)),
      projectEndDate: null,
      createdAt,
      updatedAt: r() < 0.5 ? createdAt : new Date(pick(instants)),
      manhourBudgetHours: null,
      primaryProjectManager: null,
      regionalCurrency: regional ? "OMR" : null,
      prCategory: regional ? "Oman" : "India",
    } as DashboardProjectRow;
    projects.push(p);
    const lines: InvoiceLineRow[] = [];
    for (let k = 0; k < Math.floor(r() * 6); k++) {
      lines.push({
        id: `l${i}-${k}`,
        status: pick(["Raised", "Paid", "Paid", "Draft", "Cancelled", "PartiallyPaid"]),
        invoiceAmountINR: regional ? 0 : Math.round(r() * 1_000_000) / 100,
        invoiceDate: date(),
        invoiceNo: `INV-${i}-${k}`,
        milestoneId: null,
        projectId: p.id,
        quantityItemId: `q${i}`,
        quantityBilled: 0,
        currency: regional ? "OMR" : "INR",
        exchangeRateToINR: 1,
        invoiceAmountOriginal: null,
        ...(regional ? { projectCurrency: "OMR", invoiceAmountProject: Math.round(r() * 100_000) / 1000 } : {}),
      } as InvoiceLineRow);
    }
    invoiceByProject.set(p.id, lines);
    for (let k = 0; k < Math.floor(r() * 4); k++) {
      notes.push({ id: `n${i}-${k}`, projectId: r() < 0.1 ? "ghost" : p.id, message: `note ${k}`, createdBy: "u", createdAt: new Date(pick(instants) + Math.floor(r() * 3) * 1000) });
    }
  }
  return { projects, notes, invoiceByProject };
}

describe("dashboard recent activity: the optimized builder equals the original", () => {
  test("400 randomized datasets give exactly the same ten events in the same order", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { projects, notes, invoiceByProject } = dataset(seed);
      let expected: ActivityEvent[];
      try {
        expected = referenceBuildActivity(projects, notes, invoiceByProject);
      } catch {
        // The original threw on an unreadable project/note date (it called toISOString on it); the generator only makes those for invoice dates, so this is unreachable.
        throw new Error(`reference threw for seed ${seed}`);
      }
      assert.deepEqual(buildActivity(projects, notes, invoiceByProject), expected, `seed ${seed}`);
    }
  });

  test("with fewer than ten events everything is returned, newest first, and an empty input is empty", () => {
    assert.deepEqual(buildActivity([], [], new Map()), []);
    const { projects, notes, invoiceByProject } = dataset(7);
    const out = buildActivity(projects.slice(0, 1), [], new Map());
    assert.ok(out.length >= 1 && out.length <= 2);
    assert.deepEqual(out, referenceBuildActivity(projects.slice(0, 1), [], new Map()));
    void notes;
    void invoiceByProject;
  });

  test("an unreadable invoice date is dropped, never thrown; a Paid line's text names its own project currency", () => {
    const { projects } = dataset(11);
    const p = projects[0]!;
    const lines = new Map<string, InvoiceLineRow[]>([
      [
        p.id,
        [
          { id: "bad", status: "Paid", invoiceAmountINR: 100, invoiceDate: new Date(Number.NaN), invoiceNo: "BAD", milestoneId: null, projectId: p.id, quantityItemId: "q", quantityBilled: 0, currency: "INR", exchangeRateToINR: 1, invoiceAmountOriginal: null } as InvoiceLineRow,
          { id: "omr", status: "Paid", invoiceAmountINR: 0, invoiceDate: new Date(Date.UTC(2030, 0, 1)), invoiceNo: "OM-1", milestoneId: null, projectId: p.id, quantityItemId: "q", quantityBilled: 0, currency: "OMR", exchangeRateToINR: 1, invoiceAmountOriginal: null, projectCurrency: "OMR", invoiceAmountProject: 231 } as InvoiceLineRow,
        ],
      ],
    ]);
    const out = buildActivity([p], [], lines);
    assert.ok(out.every((e) => e.id !== "invoice-bad" && e.id !== "payment-bad"));
    const payment = out.find((e) => e.id === "payment-omr")!;
    assert.match(payment.description, /paid OMR 231\.000 against OM-1\./);
    assert.ok(!payment.description.includes("₹"));
  });
});
