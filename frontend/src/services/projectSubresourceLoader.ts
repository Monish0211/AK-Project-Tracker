import type { InvoiceItem } from "../types/InvoiceItem";
import type { NonManhourExpense } from "../types/NonManhourExpense";
import type { Project } from "../types/Project";
import type { QuantityItem } from "../types/QuantityItem";
import { loadInvoiceForProject, readInvoiceItemsFromApi } from "./invoiceService";
import { loadExpensesForProject, readExpensesFromApi, rememberExpensesBaseline, type ExpensesRead } from "./otherProjectExpenseService";
import { isCompleteMilestone, loadMilestonesForProject, readMilestonesFromApi } from "./paymentMilestoneService";
import { getProjectById, refreshProjectResourcesFromBackend } from "./projectService";
import { loadQuantityForProject, readQuantityItemsFromApi } from "./quantityService";

/**
 * Opening Edit Project used to read the project's four lists (Quantity, Payment Milestones, Invoice Items, Other Project Expenses)
 * one after another, each only after the previous had answered and been written to the local mirror — about six round trips in a
 * row. This reads them at the same time.
 *
 * What stays ordered, and why. Each loader (load…ForProject) also performs the ONE-TIME MIGRATION of older, browser-stored data: if the
 * server has nothing for the project but the local mirror does, the local rows are pushed up. Those migrations depend on one another
 * (Quantity creates new server ids and the local invoice history is re-keyed onto them through the mirror; invoice lines reference
 * milestones), and each loader snapshots the mirror before its own write-through clobbers it. So:
 *
 *   1. Phase 1 — only READS, all at once, touching nothing but the network (the new read…FromApi functions do not write the mirror).
 *   2. Phase 2 — the existing loaders run in their ORIGINAL order (Quantity → Milestones → Invoices → Expenses), each handed the list
 *      Phase 1 already read, so none of them waits on the network again unless it must migrate. A loader therefore sees the mirror in
 *      exactly the state it always did, migrations run in the same order, and a migration is the barrier the lists after it wait for.
 *   3. A list that depends on a migration is never trusted from Phase 1: if Quantity or Milestones are about to migrate (server empty,
 *      local not), the Invoice read is discarded and the Invoice loader reads again AFTER them, as before.
 *
 * FAST PATH. Each loader also snapshots the mirror and writes its list through to it — a read-modify-write of the whole local project
 * cache — which exists to make the migration above safe. When NO list can migrate (the server has data, or the mirror has nothing to
 * push — the common case), none of that is needed: the lists are applied exactly as the loaders would have returned them, without the
 * four snapshots and four cache rewrites (about 340 ms of main-thread time measured), and Edit Project's own final write-through puts
 * the same lists in the cache once. If ANY list may migrate, every list takes the ordered path above, unchanged.
 *
 * Failures stay isolated exactly as before: a list whose read failed is reported as failed (its loader is not run, so nothing is
 * written for it and no second request is made); the others still load. The whole thing is shared per project while it runs, so a
 * second open of the same project never repeats a read or a migration.
 */

type PaymentMilestone = Project["paymentMilestones"][number];

export type Loaded<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface ProjectSubresources {
  quantityItems: Loaded<QuantityItem[]>;
  paymentMilestones: Loaded<PaymentMilestone[]>;
  invoiceItems: Loaded<InvoiceItem[]>;
  nonManhourExpenses: Loaded<NonManhourExpense[]>;
  /** The fetched project with the server's Team Assigned resources merged in (read at the same time as the lists). */
  project: Project;
}

/** Everything the orchestration touches — the real services in the app, fakes in tests. */
export interface SubresourceDeps {
  readQuantity: (projectId: string) => Promise<QuantityItem[]>;
  readMilestones: (projectId: string) => Promise<PaymentMilestone[]>;
  readInvoices: (projectId: string) => Promise<InvoiceItem[]>;
  readExpenses: (projectId: string) => Promise<ExpensesRead>;
  refreshResources: (project: Project) => Promise<Project>;
  loadQuantity: (projectId: string, prefetched?: QuantityItem[]) => Promise<QuantityItem[]>;
  loadMilestones: (projectId: string, prefetched?: PaymentMilestone[]) => Promise<PaymentMilestone[]>;
  loadInvoices: (projectId: string, prefetched?: InvoiceItem[]) => Promise<InvoiceItem[]>;
  loadExpenses: (projectId: string, prefetched?: ExpensesRead) => Promise<NonManhourExpense[]>;
  /** What the local mirror holds for this project right now (the legacy data a migration would push up). */
  getLocalProject: (projectId: string) => Pick<Project, "quantityItems" | "paymentMilestones" | "invoiceItems" | "nonManhourExpenses"> | undefined;
  rememberExpensesBaseline: (projectId: string, read: ExpensesRead) => void;
}

export const realSubresourceDeps: SubresourceDeps = {
  readQuantity: readQuantityItemsFromApi,
  readMilestones: readMilestonesFromApi,
  readInvoices: readInvoiceItemsFromApi,
  readExpenses: readExpensesFromApi,
  refreshResources: refreshProjectResourcesFromBackend,
  loadQuantity: loadQuantityForProject,
  loadMilestones: loadMilestonesForProject,
  loadInvoices: loadInvoiceForProject,
  loadExpenses: loadExpensesForProject,
  getLocalProject: getProjectById,
  rememberExpensesBaseline,
};

/** Runs one read / load and reports its outcome; a rejection — or a synchronous throw — becomes `{ ok: false }`, never an exception. */
function attempt<T>(run: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return run().then(
      (value): Loaded<T> => ({ ok: true, value }),
      (error: unknown): Loaded<T> => ({ ok: false, error })
    );
  } catch (error) {
    return Promise.resolve({ ok: false, error });
  }
}

async function run(projectId: string, fetched: Project, deps: SubresourceDeps): Promise<ProjectSubresources> {
  // Phase 1 — reads only, all at once. (`refreshResources` never rejects; the catch is belt and braces.)
  const [readQuantity, readMilestones, readInvoices, readExpenses, project] = await Promise.all([
    attempt(() => deps.readQuantity(projectId)),
    attempt(() => deps.readMilestones(projectId)),
    attempt(() => deps.readInvoices(projectId)),
    attempt(() => deps.readExpenses(projectId)),
    attempt(() => deps.refreshResources(fetched)).then((r) => (r.ok ? r.value : fetched)),
  ]);

  // A migration is only possible when the server's list is empty and the mirror has something worth pushing for it — the same tests the
  // loaders apply (for Milestones only COMPLETE rows migrate: the empty starting row every project carries locally does not count). If
  // Quantity or Milestones will migrate, the Invoice list read in Phase 1 predates that and must be read again afterwards (the Invoice
  // loader does it when it is given nothing).
  const local = deps.getLocalProject(projectId);
  const quantityMayMigrate = readQuantity.ok && readQuantity.value.length === 0 && (local?.quantityItems?.length ?? 0) > 0;
  const milestonesMayMigrate = readMilestones.ok && readMilestones.value.length === 0 && (local?.paymentMilestones ?? []).some(isCompleteMilestone);
  const invoicePrefetch = readInvoices.ok && !quantityMayMigrate && !milestonesMayMigrate ? readInvoices.value : undefined;
  const invoicesMayMigrate = readInvoices.ok && readInvoices.value.every((item) => item.invoices.length === 0) && (local?.invoiceItems ?? []).some((item) => item.invoices.length > 0);
  const expensesMayMigrate = readExpenses.ok && readExpenses.value.items.length === 0 && (local?.nonManhourExpenses?.length ?? 0) > 0;

  // Fast path — nothing can migrate: apply the lists as read (see the header). A failed read is carried through as a failure.
  if (!quantityMayMigrate && !milestonesMayMigrate && !invoicesMayMigrate && !expensesMayMigrate) {
    if (readExpenses.ok) deps.rememberExpensesBaseline(projectId, readExpenses.value);
    return {
      quantityItems: readQuantity,
      // The loader returns the local rows when the server has none (so the empty starting row every project shows is kept).
      paymentMilestones: readMilestones.ok && readMilestones.value.length === 0 ? { ok: true, value: (local?.paymentMilestones ?? []) as PaymentMilestone[] } : readMilestones,
      invoiceItems: readInvoices,
      nonManhourExpenses: readExpenses.ok ? { ok: true, value: readExpenses.value.items } : readExpenses,
      project,
    };
  }

  // Phase 2 — the loaders in their original order. A failed read is carried through as a failure, not retried.
  const quantityItems = readQuantity.ok ? await attempt(() => deps.loadQuantity(projectId, readQuantity.value)) : readQuantity;
  const paymentMilestones = readMilestones.ok ? await attempt(() => deps.loadMilestones(projectId, readMilestones.value)) : readMilestones;
  const invoiceItems = readInvoices.ok ? await attempt(() => deps.loadInvoices(projectId, invoicePrefetch)) : readInvoices;
  const nonManhourExpenses = readExpenses.ok ? await attempt(() => deps.loadExpenses(projectId, readExpenses.value)) : readExpenses;

  return { quantityItems, paymentMilestones, invoiceItems, nonManhourExpenses, project };
}

const inFlight = new Map<string, Promise<ProjectSubresources>>();

/** Loads the four lists for Edit Project. Never rejects. One run per project at a time: a second call while it runs shares it. */
export function loadProjectSubresources(projectId: string, fetched: Project, deps: SubresourceDeps = realSubresourceDeps): Promise<ProjectSubresources> {
  const running = inFlight.get(projectId);
  if (running) return running;
  const started: Promise<ProjectSubresources> = run(projectId, fetched, deps).finally(() => {
    if (inFlight.get(projectId) === started) inFlight.delete(projectId);
  });
  inFlight.set(projectId, started);
  return started;
}
