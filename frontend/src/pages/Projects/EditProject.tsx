import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { Project } from "../../types/Project";
import { getProjectById, normalizeProject, fetchProjectByIdFromApi } from "../../services/projectService";
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
  // having visited the List page first. Quantity/Payments/Budget/Team/
  // Expenses/Invoices continue to come from the local mirror exactly as
  // before, since those fields aren't backend-sourced yet.
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
      .then((fetched) => {
        if (!isMounted) return;
        if (fetched) {
          setProject(fetched);
          setNotFound(false);
        } else {
          setNotFound(true);
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