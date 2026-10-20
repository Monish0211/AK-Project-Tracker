import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { Project } from "../../types/Project";
import { getProjectById, normalizeProject, fetchProjectByIdFromApi, writeThroughProjectsMirror } from "../../services/projectService";
import { loadQuantityForProject } from "../../services/quantityService";
import { loadMilestonesForProject } from "../../services/paymentMilestoneService";
import { loadInvoiceForProject } from "../../services/invoiceService";
import { loadExpensesForProject, getLastKnownExpensesMeta } from "../../services/otherProjectExpenseService";
import type { ExpensesConcurrencySignal } from "../../services/otherProjectExpenseService";
import { createEmptyProject } from "../../utils/createEmptyProject";
import ProjectForm from "./components/ProjectForm";
import { readEditProjectDeepLink } from "./editProjectDeepLink";
import type { SubresourceLoadStatus } from "./components/FormButtons";
import { Button } from "../../components/ui/Button";

// P0 fix — EditProject data-loss protection. A resource that failed to load
// must never be indistinguishable from one that genuinely loaded empty (see
// FormButtons.tsx's own comment on SubresourceLoadStatus for why this
// matters). `true` = failed-or-not-yet-loaded, the SAFE default — only a
// resource's own successful load (even an empty one) ever flips its key to
// `false`. Starting every key `true` means a fresh EditProject session can
// never accidentally look "safe to save" before its fetches have actually
// resolved.
const ALL_RESOURCES_UNCONFIRMED: SubresourceLoadStatus = {
  quantity: true,
  milestones: true,
  expenses: true,
};

const EditProject = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();

  // Route state (in-app) or ?tab=…&invoiceLineId=… (weekly email links) — see readEditProjectDeepLink.
  const { tab: initialTab, activityId: initialActivityId, invoiceLineId: initialInvoiceLineId } = readEditProjectDeepLink(location.state, location.search);

  // Phase 3.1: General Information is fetched fresh from the real backend
  // on every mount (not just read from whatever the local mirror already
  // has) — this is the only way Edit is guaranteed correct even when the
  // user deep-links or refreshes straight into /projects/edit/:id without
  // having visited the List page first. Phase 3.3 adds the same treatment
  // for Quantity, and Phase 3.4 for Payment Milestones, each fetched
  // immediately after General Information resolves, before the form is
  // ever shown — see loadQuantityForProject()/loadMilestonesForProject().
  // Budget/Team/Expenses/Invoices continue to come from the local mirror
  // exactly as before, since those fields aren't backend-sourced yet.
  // loadedId tracks which id the fetch below has actually completed for —
  // deriving isLoading from "loadedId !== id" (rather than a separate
  // boolean flipped inside the effect) means switching straight from one
  // project's edit route to another's automatically goes back to loading,
  // with no synchronous setState call in the effect body itself.
  const [loadedId, setLoadedId] = useState<string | undefined>(undefined);
  const [notFound, setNotFound] = useState<boolean>(() => !id);
  const [project, setProject] = useState<Project>(() => {
    const cached = id ? getProjectById(id) : undefined;
    return cached ? normalizeProject(cached) : createEmptyProject();
  });
  // P0 fix — tracks whether each editable subresource that Save can DELETE
  // rows for (Quantity/Milestones/Expenses) has been CONFIRMED loaded this
  // session. See ALL_RESOURCES_UNCONFIRMED's comment above.
  const [resourceLoadFailed, setResourceLoadFailed] = useState<SubresourceLoadStatus>(ALL_RESOURCES_UNCONFIRMED);
  // Concurrency-warning baseline (Sept 2026) — snapshot of Other Project
  // Expenses' count/latestUpdatedAt captured the moment this session's
  // initial load resolves; compared again at Save time (see FormButtons.tsx)
  // purely to decide whether to show an informational banner. Never used
  // for data safety — removedExpenseIds (otherProjectExpenseService.ts) is
  // the actual protection, unconditionally, regardless of this value.
  const [expensesConcurrencyBaseline, setExpensesConcurrencyBaseline] = useState<ExpensesConcurrencySignal | null>(null);
  const isLoading = !!id && loadedId !== id;

  useEffect(() => {
    // No id at all — the initial state above already reflects "not found";
    // there's nothing to fetch.
    if (!id) return;

    let isMounted = true;

    fetchProjectByIdFromApi(id)
      .then(async (fetched) => {
        if (!isMounted || !fetched) {
          if (isMounted) setNotFound(!fetched);
          return;
        }

        setNotFound(false);

        // P0 fix — reset per-project BEFORE starting this project's
        // subresource fetches, so a previous project's successful load can
        // never leak into this one (e.g. Project A's Quantity loaded fine,
        // then switching straight to Project B's edit route must not let B
        // start out looking "confirmed loaded" before B's own fetch has even
        // begun). Safe to do here rather than earlier in this effect: the
        // page renders nothing but `null` for the entire duration isLoading
        // is true (see this component's isLoading-gated render below), so
        // there is no window where a stale flag could be visibly acted on.
        if (isMounted) setResourceLoadFailed(ALL_RESOURCES_UNCONFIRMED);

        // Immediately load Quantity from the backend once General
        // Information resolves, so the form never renders with stale
        // Quantity data — a failure here still shows the project (General
        // Information already loaded); Quantity simply falls back to
        // whatever normalizeProject() already carried over.
        //
        // Bug fix (Sep 2026): Quantity used to be the one step of this
        // chain NOT wrapped in its own try/catch — a Quantity failure fell
        // all the way to the outer catch below, which skipped Milestones/
        // Invoices/Expenses entirely (never even attempted) and discarded
        // the final setProject/writeThroughProjectsMirror write. Now
        // isolated exactly like the other three below: a Quantity failure
        // no longer prevents Milestones/Invoices/Expenses from being
        // attempted or the mirror from being written with whatever loaded.
        try {
          let nextProject = fetched;

          try {
            const quantityItems = await loadQuantityForProject(id);
            if (!isMounted) return;
            nextProject = normalizeProject({ ...nextProject, quantityItems });
            // P0 fix — only a genuine successful load (even one that
            // legitimately returns zero rows) ever clears this flag. The
            // catch below intentionally does NOT touch it, so it stays at
            // its safe `true` default on any failure (timeout, network
            // error, HTTP error, or a malformed response apiClient.ts
            // already converts into a thrown error).
            if (isMounted) setResourceLoadFailed((prev) => ({ ...prev, quantity: false }));
          } catch {
            // Fall through with nextProject as already set above. quantity
            // stays flagged as failed — Save will be blocked (FormButtons.tsx).
          }

          // Payment Milestones load the same way, immediately after
          // Quantity — this failure is isolated from Quantity's: if General
          // Information and Quantity already loaded successfully above,
          // Milestones failing to load (e.g. an incomplete legacy row the
          // backend's Ingest validation rejects) never discards that
          // progress. Milestones simply falls back to whatever the local
          // mirror already had for this session.
          try {
            const paymentMilestones = await loadMilestonesForProject(id);
            if (!isMounted) return;
            nextProject = normalizeProject({ ...nextProject, paymentMilestones });
            // P0 fix — see the Quantity block above for the exact rule.
            if (isMounted) setResourceLoadFailed((prev) => ({ ...prev, milestones: false }));
          } catch {
            // Fall through with nextProject as already set above. milestones
            // stays flagged as failed — Save will be blocked (FormButtons.tsx).
          }

          // Invoice data loads the same way, immediately after Payment
          // Milestones (Invoice pricing can reference a milestone's
          // percentage, so both Quantity and Milestones are already loaded
          // by this point) — isolated the same way: a failure here never
          // discards General Information/Quantity/Milestones already loaded
          // above, it simply falls back to whatever the local mirror already
          // had for this session. normalizeProject() still re-derives each
          // InvoiceItem's description/qty/uom/unitPrice/totalPrice from
          // `nextProject`'s own quantityItems either way (see
          // invoiceSyncService.ts's syncInvoiceItemsWithQuantity()) — this
          // load's job is only to bring in the backend's InvoiceLine history
          // (`.invoices[]`), which that sync already preserves by id.
          try {
            const invoiceItems = await loadInvoiceForProject(id);
            if (!isMounted) return;
            nextProject = normalizeProject({ ...nextProject, invoiceItems });
          } catch {
            // Fall through with nextProject as already set above.
          }

          // Other Project Expenses load the same way, immediately after
          // Invoice — isolated the same way: a failure here never
          // discards General Information/Quantity/Milestones already
          // loaded above, it simply falls back to whatever the local mirror
          // already had for this session.
          try {
            const nonManhourExpenses = await loadExpensesForProject(id);
            if (!isMounted) return;
            nextProject = normalizeProject({ ...nextProject, nonManhourExpenses });
            // P0 fix — see the Quantity block above for the exact rule.
            if (isMounted) setResourceLoadFailed((prev) => ({ ...prev, expenses: false }));
            // Baseline capture is free — loadExpensesForProject() above
            // already just ran the GET that populates this.
            if (isMounted) setExpensesConcurrencyBaseline(getLastKnownExpensesMeta(id));
          } catch {
            // Fall through with nextProject as already set above. expenses
            // stays flagged as failed — Save will be blocked (FormButtons.tsx).
          }

          setProject(nextProject);
          // Bug fix: this effect fetches real Quantity/Milestones/Invoice/
          // Expense data from the backend, but was only ever storing it in
          // this component's own state — never in the shared localStorage
          // mirror the Project Repository LIST reads from (getProjects()).
          // Any account other than the one that originally built this
          // project via Add Project (whose full state was already cached)
          // saw the correct Work Order Value/Pending Due here in Edit, but
          // "—" back in the list, because nothing persisted this fetch to
          // that shared cache. Writing it through here, the same way
          // fetchProjectByIdFromApi()/createProjectGeneralInfo() already do,
          // closes that gap without changing how WO Value/Pending Due are
          // calculated at all.
          writeThroughProjectsMirror([nextProject]);
        } catch {
          if (isMounted) setProject(fetched);
        }
      })
      .catch(() => {
        if (isMounted) setNotFound(true);
      })
      .finally(() => {
        if (isMounted) setLoadedId(id);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (isLoading) {
    return null;
  }

  if (notFound) {
    return (
      <div className="bg-white dark:bg-[#1E293B] rounded-xl shadow-md p-8 text-center mt-10">
        <h1 className="text-3xl font-bold text-red-600 mb-4">
          Project Not Found
        </h1>

        <Button variant="primary" type="button" onClick={() => navigate("/projects")}>
          Back to Projects
        </Button>
      </div>
    );
  }

  const hasResourceLoadFailure =
    resourceLoadFailed.quantity || resourceLoadFailed.milestones || resourceLoadFailed.expenses;

  return (
    <>
      {hasResourceLoadFailure && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl p-4 mb-3 text-sm text-red-700 dark:text-red-300">
          <p className="font-bold">Some project data could not be loaded.</p>
          <p className="mt-1">
            Saving is temporarily blocked to prevent data loss. Please reload this page before saving.
          </p>
          <ul className="mt-2 list-disc list-inside">
            {resourceLoadFailed.quantity && <li>Quantity Details failed to load</li>}
            {resourceLoadFailed.milestones && <li>Payment Milestones failed to load</li>}
            {resourceLoadFailed.expenses && <li>Other Project Expenses failed to load</li>}
          </ul>
        </div>
      )}
      <ProjectForm
        project={project}
        setProject={setProject}
        mode="edit"
        initialTab={initialTab}
        initialActivityId={initialActivityId}
        initialInvoiceLineId={initialInvoiceLineId}
        resourceLoadFailed={resourceLoadFailed}
        expensesConcurrencyBaseline={expensesConcurrencyBaseline}
      />
    </>
  );
};

export default EditProject;