import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { Project } from "../../types/Project";
import { getProjectById, normalizeProject, fetchProjectByIdFromApi, writeThroughProjectsMirror } from "../../services/projectService";
import { loadProjectSubresources } from "../../services/projectSubresourceLoader";
import { getLastKnownExpensesMeta } from "../../services/otherProjectExpenseService";
import type { ExpensesConcurrencySignal } from "../../services/otherProjectExpenseService";
import { createEmptyProject } from "../../utils/createEmptyProject";
import ProjectForm from "./components/ProjectForm";
import { readEditProjectDeepLink } from "./editProjectDeepLink";
import { batchPmoDataChanged } from "../../utils/pmoDataChanged";
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

    // One announcement for the whole load: the project, Quantity, Milestones, Invoices and Expenses each write through to the local
    // mirror, and each used to announce "data changed" — five-plus times the app-wide listeners (notification rules, sidebar counts…) ran.
    batchPmoDataChanged(() => fetchProjectByIdFromApi(id, { includeResources: false })
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

        // Once General Information resolves, the four lists are loaded before the form is ever shown, so it never renders with stale
        // data. Each list is isolated: a failure still shows the project, and that list simply falls back to whatever the mirror
        // already carried over (no failure prevents the other lists from loading or the mirror from being written).
        try {
          // The four lists are read at the same time (services/projectSubresourceLoader.ts). The one-time migration of older
          // browser-stored data still runs in its original order inside it, and a list that depends on a migration waits for it. Each
          // list's failure is isolated exactly as before: the project still shows, the list falls back to whatever the mirror carried
          // over, and — P0 fix — only a genuine successful load (even one that legitimately returns zero rows) clears its flag. A
          // failure leaves the flag at its safe `true` default, so Save stays blocked (FormButtons.tsx) rather than deleting rows.
          const loaded = await loadProjectSubresources(id, fetched);
          if (!isMounted) return;
          let nextProject = loaded.project;

          if (loaded.quantityItems.ok) {
            nextProject = normalizeProject({ ...nextProject, quantityItems: loaded.quantityItems.value });
            setResourceLoadFailed((prev) => ({ ...prev, quantity: false }));
          }

          if (loaded.paymentMilestones.ok) {
            nextProject = normalizeProject({ ...nextProject, paymentMilestones: loaded.paymentMilestones.value });
            setResourceLoadFailed((prev) => ({ ...prev, milestones: false }));
          }

          // Invoice pricing can reference a milestone's percentage, so Quantity and Milestones are applied first (as before);
          // normalizeProject() re-derives each InvoiceItem's description/qty/uom/unitPrice/totalPrice from the quantity items.
          if (loaded.invoiceItems.ok) {
            nextProject = normalizeProject({ ...nextProject, invoiceItems: loaded.invoiceItems.value });
          }

          if (loaded.nonManhourExpenses.ok) {
            nextProject = normalizeProject({ ...nextProject, nonManhourExpenses: loaded.nonManhourExpenses.value });
            setResourceLoadFailed((prev) => ({ ...prev, expenses: false }));
            // Baseline capture is free — the expenses read above already recorded it.
            setExpensesConcurrencyBaseline(getLastKnownExpensesMeta(id));
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
      }))
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