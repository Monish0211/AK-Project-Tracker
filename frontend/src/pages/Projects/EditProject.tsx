import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { Project } from "../../types/Project";
import { getProjectById, normalizeProject, fetchProjectByIdFromApi } from "../../services/projectService";
import { loadQuantityForProject } from "../../services/quantityService";
import { loadMilestonesForProject } from "../../services/paymentMilestoneService";
import { loadInvoiceForProject } from "../../services/invoiceService";
import { loadExpensesForProject } from "../../services/otherProjectExpenseService";
import { createEmptyProject } from "../../utils/createEmptyProject";
import ProjectForm from "./components/ProjectForm";
import type { TabKey } from "./components/ProjectForm";
import { Button } from "../../components/ui/Button";

const EditProject = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();

  const navState = location.state as { tab?: TabKey; activityId?: string; invoiceLineId?: string } | null;
  const initialTab = navState?.tab;
  const initialActivityId = navState?.activityId;
  const initialInvoiceLineId = navState?.invoiceLineId;

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

        // Immediately load Quantity from the backend once General
        // Information resolves, so the form never renders with stale
        // Quantity data — a failure here still shows the project (General
        // Information already loaded); Quantity simply falls back to
        // whatever normalizeProject() already carried over.
        try {
          const quantityItems = await loadQuantityForProject(id);
          if (!isMounted) return;
          let nextProject = normalizeProject({ ...fetched, quantityItems });

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
          } catch {
            // Fall through with nextProject as already set above.
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
          } catch {
            // Fall through with nextProject as already set above.
          }

          setProject(nextProject);
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

  return (
    <ProjectForm
      project={project}
      setProject={setProject}
      mode="edit"
      initialTab={initialTab}
      initialActivityId={initialActivityId}
      initialInvoiceLineId={initialInvoiceLineId}
    />
  );
};

export default EditProject;