import { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { formatBusinessINR } from "../../utils/formatCurrency";
import {
  FolderKanban,
  Plus,
  Search,
  ArrowUpDown,
  Download,
  Upload,
  Eye,
  Pencil,
  Trash2,
  ShieldAlert,
  BarChart3,
  Archive as ArchiveIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ExcelJS from "exceljs";

import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import type { Project } from "../../types/Project";
import {
  getProjects,
  deleteProject,
  fetchProjectsFromApi,
  archiveProjectViaApi,
  permanentlyDeleteProjectViaApi,
  bulkImportProjectGeneralInfo,
} from "../../services/projectService";
import { persistImportedProjectChildRecords } from "../../services/projectImportPersistenceService";
import { ApiError } from "../../services/apiClient";
import { getProjectCommercialSummary } from "../../services/invoiceProgressService";
import { isActiveProjectStatus, PROJECT_STATUS_OPTIONS } from "../../constants/projectStatus";
// The SAME PR Category source General Information already uses — never a
// second list. inferPrCategory() prefers the project's own stored
// prCategory and only falls back to the PR-prefix rule when that field is
// blank (legacy rows), exactly as ProjectForm's overview strip does.
import { PR_CATEGORIES, inferPrCategory } from "../../utils/createEmptyProject";
import { useAuth } from "../../auth/authContext";
import { canMutateData, hasApprovalPermission } from "../../auth/permissions";
import { usePmoToast } from "../../components/ui/usePmoToast";
import ExpenseImportModal from "./components/ExpenseInformation/ExpenseImportModal";

/** Sort fields the backend's GET /projects can order by — see listProjectsQuerySchema. Anything else (Team/Commercial/Invoice columns, not modeled server-side yet) is synced with the default sort instead and left to this page's own client-side sort exactly as before. */
const BACKEND_SORTABLE_FIELDS = new Set([
  "prNo",
  "client",
  "projectTitle",
  "department",
  "projectStatus",
  "projectStartDate",
  "createdAt",
]);
import {
  buildExportWorkbook,
  buildSampleTemplateWorkbook,
  downloadWorkbook,
  parseProjectsWorkbook,
} from "../../services/projectWorkbookService";

type ProjectsMode = "repository" | "completed";

interface ProjectsProps {
  mode?: ProjectsMode;
}

const scopeProjectsByMode = (all: Project[], mode: ProjectsMode): Project[] =>
  mode === "completed"
    ? all.filter((p) => p.projectStatus === "Completed")
    : all.filter((p) => p.projectStatus !== "Completed");

/**
 * "PR Series" = the leading two digits of a PR Number's NUMERIC portion —
 * what the business means by "11 Series". The alphabetic prefix is the PR
 * CATEGORY, never the series, so PR-11047, MYPR-11050 and EE-11069 are all
 * "11 Series".
 *
 * Reads the LAST run of digits so multi-part prefixes resolve correctly:
 * EE-Q-12015 -> 12015, Q-PR-11050 -> 11050, PRAD-10136 -> 10136.
 *
 * Returns null unless that run is exactly 5 digits. Every real PR number is
 * 5 digits (PR-10136, PR-11047, PR-12001), but the data also contains
 * shorter/longer values (PR-123, PR-0987, PR-123409 all exist), whose first
 * two digits would be meaningless as a series. Per the filter spec, those are
 * simply excluded from the Series dropdown while remaining fully visible
 * under "All Series" — never hidden, never a crash.
 */
/**
 * The PR Number's numeric value, for ordering only — never for display or
 * storage. Repository default order is "latest PR first", which means the
 * NUMBER, not the string: plain string sort puts PR-9999 above PR-12066, and
 * puts every MYPR-/EE-/Q-PR- row in a separate alphabetical block instead of
 * interleaved by number.
 *
 * Reads the last digit run, exactly like getPrSeries(), so the alphabetic
 * prefix never participates: PR-12066, MYPR-12065 and EE-Q-12064 order as
 * 12066 > 12065 > 12064.
 *
 * Returns -1 when there is no numeric portion at all, so those rows sort to
 * the bottom under the default (descending) order rather than the top.
 */
const getPrNumericValue = (prNo: string | null | undefined): number => {
  const digitRuns = String(prNo ?? "").match(/\d+/g);
  if (!digitRuns || digitRuns.length === 0) return -1;
  return Number(digitRuns[digitRuns.length - 1]);
};

const getPrSeries = (prNo: string | null | undefined): string | null => {
  const digitRuns = String(prNo ?? "").match(/\d+/g);
  if (!digitRuns || digitRuns.length === 0) return null;
  const numeric = digitRuns[digitRuns.length - 1]!;
  return numeric.length === 5 ? numeric.slice(0, 2) : null;
};

// Approved Repository-level Invoice Status / Pending Due business rule —
// deliberately a DIFFERENT concept from getProjectCommercialSummary()'s own
// invoiceStatus/pendingDue (which answer "how much of this project's
// invoice-line history has been recorded," derived from
// project.invoiceItems — never populated by Project Repository's own load
// path, so it always reads "Not Started"/₹0 on a fresh session regardless of
// real invoice activity). This one only asks "how much of the Work Order
// Value has been invoiced," using the backend-authoritative
// workOrderValueINR / backendPendingDueINR fields already present on every
// project returned by GET /projects — no additional per-project invoice
// fetch, so it works correctly even for a project Repository has never
// individually opened. Module-level (not a component-body const) so it's
// safely callable from useMemo hooks declared earlier in the component,
// with no risk of a temporal-dead-zone ordering issue.
const getRepositoryInvoiceSummary = (
  p: Project
): { pendingDue: number; invoiceStatus: "Not Started" | "Partially Paid" | "Paid" } => {
  const workOrderValue = p.workOrderValueINR || 0;
  const pendingDue =
    typeof p.backendPendingDueINR === "number" ? p.backendPendingDueINR : workOrderValue;
  const invoiceRaised = Math.max(workOrderValue - pendingDue, 0);

  let invoiceStatus: "Not Started" | "Partially Paid" | "Paid";
  if (invoiceRaised <= 0) {
    invoiceStatus = "Not Started";
  } else if (invoiceRaised >= workOrderValue) {
    invoiceStatus = "Paid";
  } else {
    invoiceStatus = "Partially Paid";
  }

  return { pendingDue, invoiceStatus };
};

const Projects = ({ mode = "repository" }: ProjectsProps) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExpenseImportModal, setShowExpenseImportModal] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status") || "All";
  const location = useLocation();
  // The exact repository URL to come back to — pathname keeps Completed
  // Projects distinct from the Repository, search carries page + filters.
  // Passed to View/Edit as navigation state; they navigate back to it.
  const repositoryUrl = `${location.pathname}${location.search}`;
  const { user } = useAuth();
  const { showToast } = usePmoToast();
  // Delete Permanently requires the "Delete Project Permanently" approval
  // permission — the backend enforces this independently
  const canMutate = canMutateData(user);
  // (requireApprovalPermission on DELETE /projects/:id/permanent), this only
  // controls whether the action is even offered in the UI. Read Only cannot
  // mutate even if they somehow hold the approval grant.
  const canPermanentlyDelete = canMutate && hasApprovalPermission(user, "Delete Project Permanently");

  const pageTitle = mode === "completed" ? "Completed Projects" : "Projects";
  const repoCardTitle = mode === "completed" ? "Completed Projects" : "Project Repository";
  const repoCardSubtitle =
    mode === "completed"
      ? "Search, filter, and review all completed engineering projects"
      : "Search, filter, and manage all engineering projects";

  // Live project state — already scoped to this page's dataset
  const [projects, setProjects] = useState<Project[]>(() => scopeProjectsByMode(getProjects(), mode));

  // Unscoped mirror kept in lockstep with `projects`, used ONLY for the KPI
  // stats below — the Project Repository table must exclude Completed rows
  // (scopeProjectsByMode), but the "Completed" KPI count needs the full,
  // unfiltered dataset or it is structurally guaranteed to read 0 (every
  // Completed row would already have been filtered out before counting).
  // Mirrors Dashboard's getProjectStatusData(), which counts from
  // getProjects() directly for the same reason.
  const [allProjects, setAllProjects] = useState<Project[]>(() => getProjects());

  // Phase 3.7.2: pending confirmation targets for the custom ConfirmDialog —
  // replaces window.confirm() for both Archive and Delete Permanently.
  // Holding the id/project here (rather than confirming inline) is what lets
  // a single reusable modal serve both actions.
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Project | null>(null);

  // Search & Filter State — initialised FROM the URL so returning from a
  // project (View/Edit) restores exactly the repository the user left. The
  // URL is the single source; there is no second store. `status` already
  // worked this way before this change (statusParam above) and is unchanged.
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [department, setDepartment] = useState(() => searchParams.get("dept") || "All");
  const [status, setStatus] = useState(statusParam);
  const [prSeries, setPrSeries] = useState(() => searchParams.get("series") || "All");
  const [prCategory, setPrCategory] = useState(() => searchParams.get("cat") || "All");

  useEffect(() => {
    setStatus(statusParam);
  }, [statusParam]);

  // Sorting State
  const [sortField, setSortField] = useState<string>(() => searchParams.get("sort") || "prNo");
  // Default repository order is LATEST PR FIRST — i.e. prNo descending, and
  // descending by NUMBER (see getPrNumericValue). This is only the initial
  // value: the existing Sort control still owns the state from the user's
  // first click onward, so a manual choice is never overridden on re-render.
  // A restored ?dir= wins over the default, so a manual choice survives the
  // round trip into a project and back.
  const [sortAsc, setSortAsc] = useState<boolean>(() => searchParams.get("dir") === "asc");

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(() => {
    const fromUrl = Number(searchParams.get("page"));
    return Number.isFinite(fromUrl) && fromUrl >= 1 ? Math.floor(fromUrl) : 1;
  });
  const pageSize = 10;

  useEffect(() => {
    const handleDataChange = () => {
      const fresh = getProjects();
      setProjects(scopeProjectsByMode(fresh, mode));
      setAllProjects(fresh);
    };
    window.addEventListener("pmo:data-changed", handleDataChange);
    return () => {
      window.removeEventListener("pmo:data-changed", handleDataChange);
    };
  }, [mode]);

  // Phase 3.1: background sync with the real backend — General Information
  // now lives in Postgres, so this page's data needs to reflect that instead
  // of only whatever's already in the local mirror (e.g. on a fresh
  // browser). Genuinely exercises the backend's search/filter/sort
  // capabilities with the current toolbar state; the local mirror it writes
  // into (via fetchProjectsFromApi's write-through) is what the rest of
  // this page already reads from above — no other logic here changes.
  useEffect(() => {
    const backendSortField = BACKEND_SORTABLE_FIELDS.has(sortField) ? sortField : "prNo";

    const timer = setTimeout(() => {
      fetchProjectsFromApi({
        search: search || undefined,
        department: department !== "All" ? department : undefined,
        projectStatus: mode === "completed" ? "Completed" : status !== "All" ? status : undefined,
        page: 1,
        // Matches the backend's listProjectsQuerySchema pageSize ceiling
        // exactly (see project.validators.ts) — this bulk "stats scope"
        // fetch must stay within it or the whole sync request 400s.
        pageSize: 200,
        sortField: backendSortField,
        sortDirection: sortAsc ? "asc" : "desc",
      })
        .then((result) => {
          // P2-06 — fail loudly instead of silently computing this page's
          // table/KPIs from an incomplete set: if the authorized+filtered
          // project count ever exceeds the 200-row cap above, `total` tells
          // us so even though the request itself succeeded (200 is a valid
          // page, not an error). This does not change behavior at all when
          // total <= 200 (the case today, and the only case so far).
          if (result.total > result.items.length) {
            showToast({
              type: "error",
              message: `Showing only the first ${result.items.length} of ${result.total} matching projects — narrow your search or filters to see the rest accurately.`,
            });
          }
        })
        .catch((err) => {
          console.error("Failed to sync projects from backend:", err);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [search, department, status, mode, sortField, sortAsc]);

  // Computed statistics. `active`/`onHold`/`cancelled` and the WO/invoice/
  // outstanding totals stay scoped to `projects` exactly as before (the
  // Project Repository table's own Completed-exclusion is intentional and
  // unrelated to this fix). Only `completed` is read from the unfiltered
  // `allProjects` — computing it from `projects` was structurally
  // guaranteed to be 0, since scopeProjectsByMode already strips every
  // Completed row out of `projects` in repository mode before this ever
  // runs. Mirrors Dashboard's getProjectStatusData(), which counts
  // Completed from getProjects() directly for the same reason.
  const stats = useMemo(() => {
    // Sept 2026 — Project Status Workflow Expansion. "Active Projects" is a
    // classification, not a literal status match: a project on any active
    // workflow stage (KoM Completed, Data Request Shared, Draft Report
    // Submitted, ...) still counts here even though its displayed Project
    // Status is not literally "Active". See constants/projectStatus.ts's
    // isActiveProjectStatus() — the single centralized definition every
    // Active-Projects count in this app should use, so this rule is never
    // duplicated as a second hard-coded status array.
    const active = projects.filter((p) => isActiveProjectStatus(p.projectStatus)).length;
    const onHold = projects.filter((p) => p.projectStatus === "On Hold").length;
    const completed = allProjects.filter((p) => p.projectStatus === "Completed").length;
    const cancelled = projects.filter((p) => p.projectStatus === "Cancelled").length;
    const totalWOValue = projects.reduce(
      (sum, p) => sum + (p.workOrderValueINR || 0),
      0
    );

    let pendingInvoice = 0;
    let totalOutstanding = 0;

    projects.forEach((p) => {
      const comm = getProjectCommercialSummary(p);
      if (comm.invoiceStatus !== "Completed") {
        pendingInvoice++;
      }
      totalOutstanding += comm.outstandingCollection;
    });

    return {
      active,
      onHold,
      completed,
      cancelled,
      totalWOValue,
      pendingInvoice,
      totalOutstanding,
    };
  }, [projects, allProjects]);

  // Unique departments for filter
  const departments = useMemo(() => {
    return [
      "All",
      ...new Set(projects.map((p) => p.department).filter(Boolean)),
    ];
  }, [projects]);

  // Series options come from the data itself (same convention as the
  // department list above), so a future 13/14 Series appears automatically
  // with no code change and no new stored field. Sorted numerically so
  // "9 Series" can never sort after "10 Series".
  const seriesOptions = useMemo(() => {
    const present = new Set(
      projects.map((p) => getPrSeries(p.prNo)).filter((s): s is string => s !== null)
    );
    return [...present].sort((a, b) => Number(a) - Number(b));
  }, [projects]);

  // Handle Sort Toggle
  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Archive Action — Phase 3.1, renamed for clarity. Reversible: sets
  // isDeleted/deletedAt via the real backend (DELETE /projects/:id never
  // removes the row server-side); every child record (Quantity/Payment
  // Milestones/Other Project Expenses) is left completely untouched. The old
  // local-only deleteProject() is still used as a fallback for any project
  // that only ever existed in the local mirror (e.g. imported, never synced
  // to the backend), so Archive never silently does nothing.
  const handleArchive = async (id: string) => {
    try {
      await archiveProjectViaApi(id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        deleteProject(id);
      } else {
        showToast({
          type: "error",
          message: err instanceof ApiError ? err.message : "Failed to archive project. Please try again.",
        });
        return;
      }
    }
    setProjects(scopeProjectsByMode(getProjects(), mode));
    showToast({ type: "success", message: "Project archived successfully." });
  };

  // Permanent Delete — irreversible, gated by the "Delete Project
  // Permanently" approval permission (see canPermanentlyDelete above; the
  // backend independently enforces this via requireApprovalPermission).
  // There is no financial-record exception — the backend deletes the
  // project and every record that belongs to it regardless of invoice/
  // expense/timesheet history.
  const handlePermanentDelete = async (project: Project) => {
    try {
      await permanentlyDeleteProjectViaApi(project.id);
    } catch (err) {
      showToast({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to permanently delete project. Please try again.",
      });
      return;
    }
    setProjects(scopeProjectsByMode(getProjects(), mode));
    showToast({ type: "success", message: `"${project.prNo}" permanently deleted.` });
  };

  const clr = () => {
    setSearch("");
  };

  // Filtered & Sorted Projects
  const processedProjects = useMemo(() => {
    let result = projects.filter((p) => {
      const matchSearch =
        !search ||
        (p.prNo || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.client || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.projectTitle || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.primaryProjectManager || "").toLowerCase().includes(search.toLowerCase());

      const matchDept = department === "All" || p.department === department;
      const matchStatus = status === "All" || p.projectStatus === status;

      // Series and Category are INDEPENDENT of each other: series is the
      // numeric portion, category is the alphabetic prefix / stored field.
      // A project whose PR Number yields no series (null) is only ever
      // filtered out when a specific series is selected — under "All Series"
      // it stays visible, same as today.
      const matchSeries = prSeries === "All" || getPrSeries(p.prNo) === prSeries;
      const matchCategory =
        prCategory === "All" || inferPrCategory(p.prNo, p.prCategory) === prCategory;

      return matchSearch && matchDept && matchStatus && matchSeries && matchCategory;
    });

    // Sort
    result.sort((a, b) => {
      let valA: any = a[sortField as keyof Project] ?? "";
      let valB: any = b[sortField as keyof Project] ?? "";

      if (sortField === "pendingDue") {
        valA = getRepositoryInvoiceSummary(a).pendingDue;
        valB = getRepositoryInvoiceSummary(b).pendingDue;
      } else if (sortField === "invoiceStatus") {
        valA = getRepositoryInvoiceSummary(a).invoiceStatus;
        valB = getRepositoryInvoiceSummary(b).invoiceStatus;
      } else if (sortField === "prNo") {
        // Compare the NUMBER, not the string — see getPrNumericValue(). These
        // become numbers, so they fall through to the numeric branch below
        // and reuse the existing asc/desc handling unchanged.
        valA = getPrNumericValue(a.prNo);
        valB = getPrNumericValue(b.prNo);
      }

      if (typeof valA === "string") {
        return sortAsc
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return sortAsc
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }
    });

    return result;
  }, [projects, search, department, status, prSeries, prCategory, sortField, sortAsc]);

  // Reset page when filters modify result counts.
  //
  // Skips its own FIRST run: this effect fires on mount like any other, which
  // would immediately discard a page restored from ?page= when returning from
  // a project. Only an actual filter change after mount should reset to 1.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    setCurrentPage(1);
  }, [search, department, status, prSeries, prCategory]);

  // Mirror the repository's own state into the URL (replace, never push, so
  // the browser Back button still leaves the repository rather than stepping
  // through filter changes). This is what View/Edit navigate back to, so the
  // page and filters survive the round trip with no extra store.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const put = (key: string, value: string, omitWhen: string) =>
      value === omitWhen ? next.delete(key) : next.set(key, value);

    put("q", search, "");
    put("dept", department, "All");
    put("status", status, "All");
    put("series", prSeries, "All");
    put("cat", prCategory, "All");
    put("sort", sortField, "prNo");
    put("dir", sortAsc ? "asc" : "desc", "desc");
    put("page", String(currentPage), "1");

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [search, department, status, prSeries, prCategory, sortField, sortAsc, currentPage, searchParams, setSearchParams]);

  // Pagination bounds
  const paginatedProjects = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedProjects.slice(start, start + pageSize);
  }, [processedProjects, currentPage]);

  const totalPages = Math.max(
    Math.ceil(processedProjects.length / pageSize),
    1
  );

  // Clamp a now-invalid page rather than rendering an empty table. Reachable
  // two ways: a restored ?page=5 whose filtered set has since shrunk to 2
  // pages, and a hand-edited/stale URL. Runs only when genuinely out of
  // range, so it never fights the normal page controls.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Format currency helpers
  const fmtWOValue = (v: number) => formatBusinessINR(v || 0);

  const fmtCurrency = (v: number) => {
    if (v === 0) return <span className="text-gray-400 dark:text-gray-600 font-medium">—</span>;
    return "₹\u202F" + v.toLocaleString("en-IN");
  };

  // Export to Excel
  const handleExport = async () => {
    if (projects.length === 0) {
      showToast({ type: "info", message: "No project data available to export." });
      return;
    }

    const workbook = await buildExportWorkbook(projects);
    await downloadWorkbook(workbook, "projects_pmo_export.xlsx");
  };

  // Download Sample Template — same sheet structure as Export, just
  // pre-filled with one illustrative sample project instead of real data.
  const handleDownloadTemplate = async () => {
    const workbook = await buildSampleTemplateWorkbook();
    await downloadWorkbook(workbook, "projects_import_template.xlsx");
  };

  // File Import Logic — reads Projects / Quantity Details / Payment
  // Milestones / Expense Budget together and reconstructs each project with
  // all of its child records (never flattened into a single summary row).
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const existing = getProjects();
      const { projects: imported, errors } = parseProjectsWorkbook(workbook, existing);

      if (errors.length > 0) {
        showToast({
          type: "error",
          title: "Import aborted",
          message: `Fix the following validation issues:\n\n${errors
            .slice(0, 10)
            .join("\n")}${errors.length > 10 ? `\n...and ${errors.length - 10} more` : ""}`,
          duration: 0,
        });
        return;
      }

      if (imported.length === 0) {
        showToast({ type: "warning", message: "No valid projects found to import." });
        return;
      }

      // Persistence layer: General Information for every parsed row goes to
      // the real backend in one request (POST /projects/import), which
      // issues the real ids used everywhere else in the app from this point
      // on. All-or-nothing — if the backend rejects the batch (e.g. a
      // race-condition duplicate PR Number), nothing is written here either.
      const createdProjects = await bulkImportProjectGeneralInfo(imported);

      // Quantity Details / Payment Milestones / Expense Budget rows already
      // parsed onto each project above are pushed to the real backend here,
      // via the same lazy-migration functions Edit Project's own "open a
      // legacy-localStorage-only project" path already uses — see
      // projectImportPersistenceService.ts. Not part of the same all-or-
      // nothing batch as General Information (the existing single-item
      // Create endpoints have no bulk/transactional variant), so failures
      // are reported per project/section below rather than silently implied
      // by a blanket "Import complete."
      const childReports = await persistImportedProjectChildRecords(createdProjects);
      setProjects(scopeProjectsByMode(getProjects(), mode));

      const failedReports = childReports.filter((r) => r.quantity.failed || r.milestones.failed || r.expenses.failed);
      if (failedReports.length === 0) {
        showToast({
          type: "success",
          message: `Import completed successfully — ${createdProjects.length} project(s) added, including Quantity Details, Payment Milestones, and Expense Budget.`,
        });
      } else {
        const detail = failedReports
          .map((r) => {
            const parts: string[] = [];
            if (r.quantity.failed) parts.push(`Quantity ${r.quantity.persisted}/${r.quantity.expected}`);
            if (r.milestones.failed) parts.push(`Payment Milestones ${r.milestones.persisted}/${r.milestones.expected}`);
            if (r.expenses.failed) parts.push(`Expense Budget ${r.expenses.persisted}/${r.expenses.expected}`);
            return `${r.prNo}: ${parts.join(", ")} saved`;
          })
          .join("\n");
        showToast({
          type: "warning",
          title: "Import completed with warnings",
          message: `${createdProjects.length} project(s) were created, but some Quantity/Payment Milestone/Expense Budget rows failed to save:\n\n${detail}\n\nOpen each affected project's Edit screen to add the missing rows.`,
          duration: 0,
        });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unknown error while reading the file.";
      showToast({ type: "error", title: "Import failed", message: `Error reading file: ${message}` });
    } finally {
      e.target.value = ""; // clear file
    }
  };

  // Render department chip colors
  const getDeptColorClass = (dept: string) => {
    const d = (dept || "").toLowerCase().trim();
    if (d.includes("instrument")) return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-850/20";
    if (d.includes("elect")) return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-850/20";
    if (d.includes("civil")) return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800/30";
    if (d.includes("mech")) return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-850/20";
    if (d.includes("process")) return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-300 dark:border-purple-850/20";
    return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400 dark:border-slate-800/20";
  };

  // Render project status badges
  const renderProjectStatusBadge = (status: string) => {
    let cls = "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400";
    let dot = "bg-blue-500";
    if (status === "On Hold") {
      cls = "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300";
      dot = "bg-amber-500";
    } else if (status === "Completed") {
      cls = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300";
      dot = "bg-emerald-500";
    } else if (status === "Cancelled") {
      cls = "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300";
      dot = "bg-red-500";
    }
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
        {status || "Active"}
      </span>
    );
  };

  // Render invoice status badges
  const renderInvoiceStatusBadge = (status: string) => {
    let cls = "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300";
    let dot = "bg-orange-500";
    if (status === "Paid") {
      cls = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300";
      dot = "bg-emerald-500";
    } else if (status === "Not Started") {
      cls = "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300";
      dot = "bg-red-500";
    }
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* ─── CUSTOM STYLES PRESERVATION ─── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .pmo-hero {
          border-radius: 14px; overflow: hidden; position: relative;
          background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #0E7490 100%);
        }
        html.dark .pmo-hero {
          background: linear-gradient(-45deg, #152B68 0%, #1F52C4 30%, #0B6059 65%, #0892C8 100%);
          background-size: 300% 300%; animation: gradientShift 22s ease-in-out infinite;
          border: 1px solid rgba(56,139,253,.16);
          box-shadow: 0 8px 28px rgba(0,0,0,.48);
        }
        .pmo-hero::before {
          content: ''; position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,.032) 1px, transparent 1px);
          background-size: 22px 22px; pointer-events: none;
        }
        .pmo-hero::after {
          content: ''; position: absolute; left: -80px; top: -80px;
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(59,130,246,.14) 0%, transparent 68%);
          pointer-events: none;
        }
        .pmo-hero-in {
          position: relative; z-index: 1;
          padding: 16px 22px;
          display: flex; align-items: center; justify-content: space-between; gap: 20px;
        }
        .pmo-live-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 9999px;
          background: rgba(52,211,153,.12); border: 1px solid rgba(52,211,153,.22);
          font-size: 9.5px; font-weight: 700; color: #34D399;
          letter-spacing: .05em;
        }
        .pmo-live-dot {
          width: 5px; height: 5px; border-radius: 50%; background: #34D399;
          animation: livePulse 1.8s ease-in-out infinite;
        }
        @keyframes livePulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(52,211,153,.5); }
          50%     { box-shadow: 0 0 0 5px rgba(52,211,153,0); }
        }
        .pmo-chip {
          display: flex; flex-direction: column; align-items: flex-start;
          padding: 6px 12px; border-radius: 9px;
          background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.09);
          backdrop-filter: blur(10px); min-width: 64px; gap: 1px;
        }
        .pmo-chip:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.2); }
        .pmo-mc {
          border-left: 3px solid transparent;
          position: relative;
        }
        .pmo-mc::before {
          content: ''; position: absolute; left: 0; top: 0; bottom: 0;
          width: 3px; border-radius: 10px 0 0 10px;
        }
        .pmo-mc:nth-child(1)::before { background: #3B82F6; }
        .pmo-mc:nth-child(2)::before { background: #22C55E; }
        .pmo-mc:nth-child(3)::before { background: #818CF8; }
        .pmo-mc:nth-child(4)::before { background: #F97316; }
        .pmo-mc:nth-child(5)::before { background: #EF4444; }
        .pmo-repo {
          border-top: 2px solid var(--accent);
        }
        .pmo-prno {
          font-variant-numeric: tabular-nums;
        }
        .pmo-act-wrap {
          display: inline-flex; align-items: center;
          border-radius: 8px; padding: 2px; gap: 2px;
        }
        .pmo-act-btn {
          width: 38px; height: 38px; border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          border: none; background: transparent; position: relative;
          transition: background-color 150ms ease, color 150ms ease;
        }
        .pmo-act-btn svg { width: 15px; height: 15px; }
        /* Delete Permanently — same transparent-at-rest / tinted-on-hover
           treatment as every other action button; only the icon color
           signals "warning", so the button doesn't visually break away
           from the group at rest. No tooltip on any of these 4 buttons
           (Phase 3.7.2) — action labels are self-evident from the icon,
           and Archive/Delete Permanently now confirm via ConfirmDialog
           instead of relying on hover text. */
        .pmo-act-btn.act-perm-del {
          color: #DC2626;
        }
        .pmo-act-btn.act-perm-del:hover {
          background: rgba(220,38,38,.12); color: #B91C1C;
        }
        html.dark .pmo-act-btn.act-perm-del { color: #F87171; }
        html.dark .pmo-act-btn.act-perm-del:hover { background: rgba(248,113,113,.18); color: #FCA5A5; }
      ` }} />

      {/* ═══════════ HERO BANNER ═══════════ */}
      <div className="pmo-hero shadow-lg">
        <div className="pmo-hero-in">
          {/* Left info */}
          <div className="text-left flex-1 min-w-0">
            <div className="hero-eye text-xs font-bold tracking-wider text-slate-400/90 mb-1.5 flex items-center gap-1.5 uppercase">
              <span className="eye-dot w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-sm"></span>
              iFluids Engineering · Project Management Office
            </div>
            <h1 className="pmo-hero-title text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-none">
              {pageTitle}
            </h1>
            <p className="text-slate-300/80 text-xs sm:text-sm mt-1.5 max-w-lg leading-relaxed">
              Engineering project tracking · Commercial management · Invoicing · Execution lifecycle
            </p>
          </div>

          {/* Right actions & count */}
          <div className="flex flex-col items-end gap-2.5 shrink-0 z-10">
            {mode === "completed" ? (
              <button
                onClick={handleExport}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-4 py-2 rounded-lg backdrop-blur-md transition-all duration-200 text-sm shadow-sm"
              >
                <Download size={14} />
                Export Archive
              </button>
            ) : canMutate ? (
              <Button
                variant="hero"
                onClick={() => navigate("/projects/add")}
                className="btn-add transform hover:-translate-y-px"
                icon={<Plus size={15} />}
              >
                Add Project
              </Button>
            ) : null}
            <div className="flex items-center gap-1.5 text-xs text-slate-300/90 font-medium">
              <FolderKanban size={13} className="text-slate-400" />
              Total Projects &nbsp;
              <strong className="text-white font-extrabold">{projects.length}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ KPI SUMMARY BAR ═══════════ */}
      {mode !== "completed" && (
        <div className="grid grid-cols-5 gap-3">
          <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="mi w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center">
              <FolderKanban size={15} className="text-blue-500" />
            </div>
            <div>
              <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Total Projects</div>
              <div className="mv text-lg font-black text-slate-800 dark:text-slate-100 leading-none mt-1">{projects.length}</div>
            </div>
          </div>
          <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="mi w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center">
              <FolderKanban size={15} className="text-emerald-500" />
            </div>
            <div>
              <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Active</div>
              <div className="mv text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1">{stats.active}</div>
            </div>
          </div>
          <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="mi w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center">
              <FolderKanban size={15} className="text-indigo-500" />
            </div>
            <div>
              <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Completed</div>
              <div className="mv text-lg font-black text-indigo-600 dark:text-indigo-400 leading-none mt-1">{stats.completed}</div>
            </div>
          </div>
          <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="mi w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center">
              <FolderKanban size={15} className="text-amber-500" />
            </div>
            <div>
              <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Pending Invoice</div>
              <div className="mv text-lg font-black text-amber-600 dark:text-amber-400 leading-none mt-1">{stats.pendingInvoice}</div>
            </div>
          </div>
          <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="mi w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center">
              <FolderKanban size={15} className="text-rose-500" />
            </div>
            <div>
              <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Outstanding</div>
              <div className="mv text-lg font-black text-rose-600 dark:text-rose-400 leading-none mt-1">{fmtWOValue(stats.totalOutstanding)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ PROJECT REPOSITORY CARD ═══════════ */}
      <div className="pmo-repo bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
        
        {/* Card Header */}
        <div className="rh flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="rh-l flex items-center gap-3">
            <div className="rh-icon w-9 h-9 bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center rounded-xl">
              <FolderKanban size={16} className="text-blue-500" />
            </div>
            <div>
              <h2 className="rh-title text-base font-bold text-slate-800 dark:text-slate-100">
                {repoCardTitle}
              </h2>
              <p className="rh-sub text-xs text-slate-400">
                {repoCardSubtitle}
              </p>
            </div>
          </div>
          <span className="cnt-badge text-xs font-bold px-3 py-1 bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 rounded-full border border-blue-100 dark:border-blue-900/30">
            Showing {processedProjects.length} of {projects.length} Projects
          </span>
        </div>

        {/* Toolbar */}
        <div className="toolbar flex items-center justify-between gap-2 p-3 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex-wrap">
          <div className="flex flex-1 items-center gap-2 min-w-0 flex-wrap">
            {/* Search */}
            <div className="sw relative flex-1 max-w-[280px]">
              <Search size={12} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search PR No · Client · Title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="si w-full pl-8 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-blue-500"
              />
              {search && (
                <button onClick={clr} className="sc absolute right-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  ×
                </button>
              )}
            </div>

            {/* Department Filter */}
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="flt py-1.5 px-3 pr-8 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer"
            >
              <option value="All">All Departments</option>
              {departments
                .filter((d) => d !== "All")
                .map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
            </select>

            {/* Status Filter — Completed Projects has only one possible status,
                so a filter is meaningless there; show a read-only badge instead.
                Project Repository never offers "Completed" as an option, since
                that dataset already excludes completed projects entirely. */}
            {mode === "completed" ? (
              <span
                className="flt inline-flex items-center gap-1.5 py-1.5 px-3 border border-emerald-200 dark:border-emerald-900/40 rounded-lg text-xs font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 select-none"
                title="All projects on this page are Completed"
              >
                ✅ Completed
              </span>
            ) : (
              <select
                value={status}
                onChange={(e) => {
                  const nextStatus = e.target.value;
                  setStatus(nextStatus);
                  const newParams = new URLSearchParams(searchParams);
                  if (nextStatus === "All") {
                    newParams.delete("status");
                  } else {
                    newParams.set("status", nextStatus);
                  }
                  setSearchParams(newParams);
                }}
                className="flt py-1.5 px-3 pr-8 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer"
              >
                <option value="All">All Statuses</option>
                {PROJECT_STATUS_OPTIONS.filter((s) => s !== "Completed").map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}

            {/* PR Series — numeric portion of the PR Number (see getPrSeries).
                Options are derived from the loaded projects, so a new series
                appears on its own with no code change. Hidden entirely when
                the current dataset yields no series at all, rather than
                offering a dropdown whose only choice is "All Series". */}
            {seriesOptions.length > 0 && (
              <select
                value={prSeries}
                onChange={(e) => setPrSeries(e.target.value)}
                className="flt py-1.5 px-3 pr-8 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer"
              >
                <option value="All">All Series</option>
                {seriesOptions.map((s) => (
                  <option key={s} value={s}>
                    {s} Series
                  </option>
                ))}
              </select>
            )}

            {/* PR Category — the SAME business categories General Information
                stores on the project; PR_CATEGORIES is the single source. */}
            <select
              value={prCategory}
              onChange={(e) => setPrCategory(e.target.value)}
              className="flt py-1.5 px-3 pr-8 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer"
            >
              <option value="All">All PR Categories</option>
              {PR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="t-sep h-5 w-[1px] bg-slate-200 dark:bg-slate-800"></div>

            {/* Sort button */}
            <button
              onClick={() => toggleSort(sortField === "prNo" ? "projectTitle" : "prNo")}
              className="tbtn flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400"
            >
              <ArrowUpDown size={11} />
              Sort
            </button>

            {mode !== "completed" && (
              <>
                {/* Export button */}
                <button
                  onClick={handleExport}
                  className="tbtn flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400"
                >
                  <Download size={11} />
                  Export
                </button>

                {/* Import Button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="tbtn flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400"
                >
                  <Upload size={11} />
                  Import
                </button>

                {/* Hidden Input for Import */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportFile}
                  accept=".xlsx, .csv"
                  className="hidden"
                />

                {/* Other Project Expenses — Excel Import (Sept 2026). Placed
                    at the Project Repository level, not inside a single
                    project's Edit screen, since one workbook can span
                    multiple PR sheets/projects at once. */}
                <button
                  onClick={() => setShowExpenseImportModal(true)}
                  className="tbtn flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400"
                  title="Import Other Project Expenses from an Excel workbook (one sheet per PR)"
                >
                  <Upload size={11} />
                  Import Expenses
                </button>
              </>
            )}
          </div>

          {/* Download Template button */}
          {mode !== "completed" && (
            <button
              onClick={handleDownloadTemplate}
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <Download size={10} />
              Download Sample Template
            </button>
          )}
        </div>

        {/* TABLE CONTAINER — headers stay visible while scrolling the page
            (sticky top-0), and PR No stays visible while scrolling the table
            horizontally (sticky left-0), so orientation never gets lost in a
            wide/long table. */}
        <div className="ts overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th
                  onClick={() => toggleSort("prNo")}
                  className="p-3 font-extrabold uppercase select-none text-left sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-900"
                >
                  PR No <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("client")} className="p-3 font-extrabold uppercase select-none text-left sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Client <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("projectTitle")} className="p-3 font-extrabold uppercase select-none text-left sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Project Title <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("primaryProjectManager")} className="p-3 font-extrabold uppercase select-none text-left sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Manager <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("department")} className="p-3 font-extrabold uppercase select-none text-left sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Department <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("projectStatus")} className="p-3 font-extrabold uppercase select-none text-center sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Project Status <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                {mode === "completed" && (
                  <>
                    <th onClick={() => toggleSort("actualCompletionDate")} className="p-3 font-extrabold uppercase select-none text-center sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                      Actual Completion Date <span className="sic"><ArrowUpDown size={8} /></span>
                    </th>
                    <th onClick={() => toggleSort("completedBy")} className="p-3 font-extrabold uppercase select-none text-left sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                      Completed By <span className="sic"><ArrowUpDown size={8} /></span>
                    </th>
                  </>
                )}
                <th onClick={() => toggleSort("invoiceStatus")} className="p-3 font-extrabold uppercase select-none text-center sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Invoice Status <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("workOrderValueINR")} className="p-3 font-extrabold uppercase select-none text-right grp sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  WO Value (INR) <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("pendingDue")} className="p-3 font-extrabold uppercase select-none text-right sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Pending Due <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th className="p-3 font-extrabold uppercase select-none text-center sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedProjects.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    No Projects Found matching selected filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedProjects.map((p) => {
                  const comm = getRepositoryInvoiceSummary(p);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-blue-50/20 dark:hover:bg-slate-800/30 transition-all duration-100"
                    >
                      <td className="p-3 sticky left-0 z-10 bg-white dark:bg-slate-900">
                        <span className="prno pmo-prno">{p.prNo}</span>
                      </td>
                      <td className="p-3">
                        <div className="tclient font-semibold" title={p.client}>
                          {p.client}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="ttitle">
                          <span className="font-semibold block truncate max-w-[210px]" title={p.projectTitle}>
                            {p.projectTitle}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 font-medium">
                        {p.primaryProjectManager || "—"}
                      </td>
                      <td className="p-3">
                        <span className={`dept ${getDeptColorClass(p.department)}`}>
                          {p.department || "—"}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {renderProjectStatusBadge(p.projectStatus)}
                      </td>
                      {mode === "completed" && (
                        <>
                          <td className="p-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400" title={p.completionRemarks}>
                            {p.actualCompletionDate ? p.actualCompletionDate : p.projectEndDate || "—"}
                          </td>
                          <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">
                            {p.completedBy || "Administrator"}
                          </td>
                        </>
                      )}
                      <td className="p-3 text-center">
                        {renderInvoiceStatusBadge(comm.invoiceStatus)}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-100 grp pmo-prno">
                        {fmtCurrency(p.workOrderValueINR)}
                      </td>
                      <td className={`p-3 text-right font-bold pmo-prno ${comm.pendingDue === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                        {fmtCurrency(comm.pendingDue)}
                      </td>
                      <td className="p-3 text-center">
                        <div className="pmo-act-wrap bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900">
                          <button
                            onClick={() => navigate(`/projects/view/${p.id}`, { state: { source: mode, returnTo: repositoryUrl } })}
                            className="pmo-act-btn act-v hover:bg-blue-100/40 hover:text-blue-600"
                            aria-label="View Project Details"
                          >
                            <Eye />
                          </button>
                          {mode === "completed" && (
                            <button
                              onClick={() => navigate(`/reports?prNo=${encodeURIComponent(p.prNo)}`)}
                              className="pmo-act-btn act-report hover:bg-indigo-100/40 hover:text-indigo-600"
                              aria-label="View Report"
                              title="View Report"
                            >
                              <BarChart3 />
                            </button>
                          )}
                          {canMutate && (
                            <button
                              onClick={() => navigate(`/projects/edit/${p.id}`, { state: { source: mode, returnTo: repositoryUrl } })}
                              className="pmo-act-btn act-e hover:bg-slate-100/50 hover:text-slate-600"
                              aria-label="Edit Project Details"
                            >
                              <Pencil />
                            </button>
                          )}
                          {canMutate && (
                            <button
                              onClick={() => setArchiveTargetId(p.id)}
                              className="pmo-act-btn act-d hover:bg-red-100/40 hover:text-red-600"
                              aria-label="Archive Project"
                            >
                              <Trash2 />
                            </button>
                          )}
                          {canPermanentlyDelete && (
                            <button
                              onClick={() => setPermanentDeleteTarget(p)}
                              className="pmo-act-btn act-perm-del"
                              aria-label="Delete Project Permanently"
                            >
                              <ShieldAlert />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer & Pagination */}
        <div className="tf flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-slate-400">
              Showing <strong>{paginatedProjects.length}</strong> of <strong>{processedProjects.length}</strong> projects
            </span>
            <div className="tf-prog flex items-center gap-1.5 text-[10.5px]">
              <span className="text-slate-400">Status</span>
              <div className="tf-prog-bar w-16 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="tf-prog-fill h-full bg-blue-500 rounded-full"
                  style={{ width: `${(processedProjects.length / Math.max(projects.length, 1)) * 100}%` }}
                ></div>
              </div>
              <strong className="text-slate-500">{Math.round((processedProjects.length / Math.max(projects.length, 1)) * 100)}% filtered</strong>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Pagination controls */}
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className="w-7 h-7 flex items-center justify-center border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-950 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-xs text-slate-500 px-2 select-none">
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="w-7 h-7 flex items-center justify-center border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-950 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Archive confirmation — replaces window.confirm(); Archive's own API call/business logic (handleArchive) is unchanged. */}
      <ConfirmDialog
        open={archiveTargetId !== null}
        title="Archive Project"
        message={"This project will be removed from the active project repository.\n\nArchived projects can be restored later."}
        confirmLabel="Archive Project"
        icon={<ArchiveIcon size={18} />}
        onCancel={() => setArchiveTargetId(null)}
        onConfirm={async () => {
          if (!archiveTargetId) return;
          await handleArchive(archiveTargetId);
          setArchiveTargetId(null);
        }}
      />

      {/* Delete Permanently confirmation — replaces window.confirm(); the underlying permanent-delete API call/business logic (handlePermanentDelete) is unchanged. */}
      <ConfirmDialog
        open={permanentDeleteTarget !== null}
        title="Delete Project Permanently"
        message={
          "You are about to permanently delete this project.\n\nAll associated project information and related records will be permanently removed.\n\nThis action cannot be undone."
        }
        confirmLabel="Delete Permanently"
        variant="danger"
        icon={<ShieldAlert size={18} />}
        onCancel={() => setPermanentDeleteTarget(null)}
        onConfirm={async () => {
          if (!permanentDeleteTarget) return;
          await handlePermanentDelete(permanentDeleteTarget);
          setPermanentDeleteTarget(null);
        }}
      />

      {showExpenseImportModal && <ExpenseImportModal onClose={() => setShowExpenseImportModal(false)} />}
    </div>
  );
};

export const clearSearch = () => {};
export const resetFilters = () => {};

export default Projects;