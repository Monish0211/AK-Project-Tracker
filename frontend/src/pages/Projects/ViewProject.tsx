import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Briefcase, CreditCard, History, LayoutGrid, Package, Receipt, Users, Wallet } from "lucide-react";

import "./project-workspace-theme.css";
import type { Project } from "../../types/Project";
import { getProjectById, fetchProjectByIdFromApi } from "../../services/projectService";
import { getProjectCommercialSummary } from "../../services/invoiceProgressService";
import {
  getGrossProfit,
  getProfitMargin,
  getTotalProjectCost,
} from "../../services/expenseService";
import { getProjectActivityTimeline } from "../../services/projectActivityService";
import { calculateProjectCompletionPercentage, getActualTimesheetEmployeeCount } from "../../utils/projectMetrics";
import { useAuth } from "../../auth/authContext";
import { canMutateData } from "../../auth/permissions";
import { Button } from "../../components/ui/Button";

import GeneralView from "./components/GeneralView";
import QuantityTable from "./components/QuantityTable";
import PaymentMilestoneView from "./components/PaymentMilestoneView";
import ExpenseBudgetView from "./components/ExpenseBudgetView";
import TeamAssignedView from "./components/TeamAssignedView";
import NonManhourExpenseView from "./components/NonManhourExpenseView";
import InvoiceProgressView from "./components/InvoiceProgressView";
import { ProjectWorkspaceDrawer } from "../../components/Dashboard/ProjectWorkspaceDrawer";

import ProjectWorkspaceHeader from "./components/workspace/ProjectWorkspaceHeader";
import ProjectSummaryStrip from "./components/workspace/ProjectSummaryStrip";
import ProjectTabNav from "./components/workspace/ProjectTabNav";
import type { WorkspaceTabConfig } from "./components/workspace/ProjectTabNav";
import ProjectActivityTimeline from "./components/workspace/ProjectActivityTimeline";

// ─── Tabs config ──────────────────────────────────────────────────────────────

type TabKey = "general" | "quantity" | "payments" | "budget" | "team" | "expenses" | "invoices" | "timeline";

const TABS: WorkspaceTabConfig<TabKey>[] = [
  { key: "general", label: "General", icon: LayoutGrid },
  { key: "quantity", label: "Quantity", icon: Package },
  { key: "payments", label: "Payment Milestones", icon: CreditCard },
  { key: "budget", label: "Expense Budget", icon: Wallet },
  { key: "team", label: "Team Assigned", icon: Users },
  { key: "expenses", label: "Other Project Expenses", icon: Briefcase },
  { key: "invoices", label: "Invoices", icon: Receipt },
  { key: "timeline", label: "Timeline", icon: History },
];

// ─── Main component ───────────────────────────────────────────────────────────

const ViewProject = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const canMutate = canMutateData(user);
  const [activeTab, setActiveTab] = useState<TabKey>(TABS[0].key);
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  // Which module the user opened this project from (Project Repository or
  // Completed Projects) — preserved from Projects.tsx's row action so Back
  // returns to the right place and the Sidebar keeps the right item
  // highlighted, instead of always assuming Project Repository.
  const source = (location.state as { source?: "repository" | "completed" } | null)?.source;
  const backDestination = source === "completed" ? "/projects/completed" : "/projects";

  const [, setRefreshTrigger] = useState(0);

  // Phase 3.1: General Information is fetched fresh from the real backend
  // on mount (not just whatever the local mirror already has), same
  // reasoning as EditProject.tsx. Every other tab keeps reading from
  // whatever's in the local mirror already, refreshed here whenever
  // "pmo:data-changed" fires (e.g. from the ProjectWorkspaceDrawer), exactly
  // as before.
  const [project, setProjectState] = useState<Project | null>(() => (id ? getProjectById(id) ?? null : null));
  // loadedId tracks which id the fetch below has actually completed for —
  // deriving isLoading from "loadedId !== id" (rather than a separate
  // boolean flipped inside the effect) means switching straight from one
  // project's view route to another's automatically goes back to loading,
  // with no synchronous setState call in the effect body itself.
  const [loadedId, setLoadedId] = useState<string | undefined>(undefined);
  const isLoading = !!id && loadedId !== id;

  // Sync active tab & notes state to session storage so Breadcrumb can read it
  useEffect(() => {
    sessionStorage.setItem("view-project-tab", activeTab);
    sessionStorage.setItem("view-project-notes", String(isNotesOpen));
    window.dispatchEvent(new Event("pmo-project-view-state-change"));
  }, [activeTab, isNotesOpen]);

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    fetchProjectByIdFromApi(id)
      .then((fetched) => {
        if (isMounted && fetched) setProjectState(fetched);
      })
      .finally(() => {
        if (isMounted) setLoadedId(id);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Listen for external project updates (like from the ProjectWorkspaceDrawer)
  useEffect(() => {
    const handleDataChange = () => {
      setRefreshTrigger((prev) => prev + 1);
      if (id) {
        const latest = getProjectById(id);
        if (latest) setProjectState(latest);
      }
    };
    window.addEventListener("pmo:data-changed", handleDataChange);
    return () => window.removeEventListener("pmo:data-changed", handleDataChange);
  }, [id]);

  if (!id) {
    return <div className="text-center mt-10">Invalid Project Id</div>;
  }

  if (isLoading) {
    return null;
  }

  if (!project) {
    return (
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-md p-8">
        <h1 className="text-3xl font-bold text-red-600 mb-4">Project Not Found</h1>
        <Button variant="primary" onClick={() => navigate(backDestination)}>
          Back to Projects
        </Button>
      </div>
    );
  }

  // ── Existing calculations, unchanged ───────────────────────────────────────
  const totalProjectCost = getTotalProjectCost(project.manhourExpenses, project.nonManhourExpenses);
  const grossProfit = getGrossProfit(project.workOrderValueINR || 0, totalProjectCost);
  const profitMargin = getProfitMargin(project.workOrderValueINR || 0, grossProfit);
  const hasRevenue = (project.workOrderValueINR || 0) > 0;
  const hasWoQty = project.totalWOQty > 0;
  const pendingQtyPercentage = hasWoQty ? (project.totalPendingQty / project.totalWOQty) * 100 : 0;
  const completionPercent = calculateProjectCompletionPercentage(project);

  const commercialSummary = getProjectCommercialSummary(project);

  const paymentReceived = commercialSummary.totalPaymentReceived;

  const budget = (project.manhourBudgetAmount || 0) + (project.nonManhourBudgetAmount || 0);
  const milestoneCount = project.paymentMilestones?.length || 0;
  // Matches the Team Assigned tab below exactly — both read the same
  // actual-timesheet-activity engine, so this header stat and that tab can
  // never disagree.
  const teamCount = getActualTimesheetEmployeeCount(project);
  const activityEvents = getProjectActivityTimeline(project);

  // ── Tab navigation helpers ─────────────────────────────────────────────────
  const activeIndex = TABS.findIndex((t) => t.key === activeTab);
  const isLastTab = activeIndex === TABS.length - 1;
  const isFirstTab = activeIndex === 0;

  const goNext = () => {
    if (!isLastTab) setActiveTab(TABS[activeIndex + 1].key);
  };

  const goBack = () => {
    if (isFirstTab) {
      navigate(backDestination);
    } else {
      setActiveTab(TABS[activeIndex - 1].key);
    }
  };

  const goEdit = () =>
    navigate(`/projects/edit/${project.id}`, {
      state: { tab: activeTab, source },
    });

  return (
    <div className="project-workspace-shell -m-6 p-4 space-y-3.5 nu-fade-in">
      <ProjectWorkspaceHeader
        project={project}
        progressPercent={completionPercent}
        profitMargin={profitMargin}
        hasRevenue={hasRevenue}
        pendingQtyPercentage={pendingQtyPercentage}
        invoiceRaised={commercialSummary.totalInvoiceRaised}
        outstanding={commercialSummary.outstandingCollection}
        notesCount={project.notes?.length || 0}
        onOpenNotes={() => setIsNotesOpen(true)}
        onEdit={canMutate ? goEdit : undefined}
      />

      <ProjectSummaryStrip
        workOrderValue={project.workOrderValueINR || 0}
        invoiceRaised={commercialSummary.totalInvoiceRaised}
        paymentReceived={paymentReceived}
        outstanding={commercialSummary.outstandingCollection}
        budget={budget}
        expenses={totalProjectCost}
        profit={grossProfit}
        completionPercent={completionPercent}
        milestoneCount={milestoneCount}
        teamCount={teamCount}
      />

      {/* ─── Tabbed Section ──────────────────────────────────────────────── */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] overflow-hidden">
        <ProjectTabNav tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        <div className="p-6">
          {activeTab === "general" && <GeneralView project={project} />}
          {activeTab === "quantity" && <QuantityTable project={project} />}
          {activeTab === "payments" && <PaymentMilestoneView project={project} />}
          {activeTab === "budget" && <ExpenseBudgetView project={project} />}
          {activeTab === "team" && <TeamAssignedView project={project} />}
          {activeTab === "expenses" && <NonManhourExpenseView expenses={project.nonManhourExpenses} />}
          {activeTab === "invoices" && <InvoiceProgressView project={project} />}
          {activeTab === "timeline" && <ProjectActivityTimeline events={activityEvents} />}
        </div>
      </div>

      {/* ─── Sticky Bottom Action Bar ─────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-[var(--nu-surface)]/95 backdrop-blur-md border-t border-[var(--nu-border)] py-3 px-4 flex justify-between items-center shadow-[var(--nu-shadow-md)] -mx-4 z-40 rounded-t-[var(--nu-radius-lg)]">
        <Button variant="secondary" size="sm" icon={<ArrowLeft size={14} />} onClick={goBack}>
          Back
        </Button>

        <div className="flex gap-2">
          {!isLastTab && (
            <Button variant="outline" size="sm" icon={<ArrowRight size={14} />} onClick={goNext} className="flex-row-reverse">
              Next
            </Button>
          )}

          {canMutate && (
            <Button variant="primary" size="sm" onClick={goEdit}>
              Edit Project
            </Button>
          )}
        </div>
      </div>

      {/* Project Workspace Slide-over Drawer (Interactive) */}
      <ProjectWorkspaceDrawer
        isOpen={isNotesOpen}
        onClose={() => setIsNotesOpen(false)}
        project={project}
        setProject={() => {}} // State updates triggered via pmo:data-changed
        readOnly={!canMutate}
      />
    </div>
  );
};

export default ViewProject;
