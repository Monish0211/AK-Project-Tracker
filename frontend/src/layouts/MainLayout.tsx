import { lazy, Suspense, useEffect } from "react";
import { Routes, Route } from "react-router-dom";

import Sidebar from "../components/Sidebar/Sidebar";
import Navbar from "../components/Navbar/Navbar";
import { GlobalReminderProvider } from "../notifications/GlobalReminderProvider";
import { ModuleRoute } from "../auth/ModuleRoute";
import { PmoAssistant } from "../components/PmoAssistant/PmoAssistant";
import { loadEmployeesForApp } from "../services/employeeService";

import Dashboard from "../pages/Dashboard/Dashboard";

/* Projects */
import Projects from "../pages/Projects/Projects";
import CompletedProjects from "../pages/Projects/CompletedProjects";
import ArchivedProjects from "../pages/Projects/ArchivedProjects";
import FinancialLossProjects from "../pages/Projects/FinancialLossProjects";
import TimelineAlertProjects from "../pages/Projects/TimelineAlertProjects";
import TimesheetPendingProjects from "../pages/Projects/TimesheetPendingProjects";
import TeamLeadsWorkloadProjects from "../pages/Projects/TeamLeadsWorkloadProjects";
import AddProject from "../pages/Projects/AddProject";
import ViewProject from "../pages/Projects/ViewProject";
import EditProject from "../pages/Projects/EditProject";

/* Notes — dedicated, read-only Notes register (Sept 2026) */
import Notes from "../pages/Notes/Notes";

/* Customer Master */
import CustomerMaster from "../pages/CustomerMaster/CustomerMaster";

/* Other Modules */
import Manpower from "../pages/Manpower/Manpower";
import Timesheets from "../pages/Timesheets/Timesheets";
import ReportsPage from "../pages/ReportsPage";
import Settings from "../pages/Settings/Settings";

/* Settings → Weekly Emails sub-pages (Oct 2026) — lazy: only admins open them, and only on demand. */
const WeeklyEmailPreviewPage = lazy(() => import("../pages/Settings/WeeklyEmails/WeeklyEmailPreviewPage"));
const WeeklyEmailRunsPage = lazy(() => import("../pages/Settings/WeeklyEmails/WeeklyEmailRunsPage"));
const pageFallback = <div className="py-16 text-center text-[12px] text-[var(--nu-text-muted)]">Loading…</div>;

/* PR Request & Two-Level Approval Workflow */
import RequestPR from "../pages/PRRequests/RequestPR";
import PRRequests from "../pages/PRRequests/PRRequests";
import PRRequestDetail from "../pages/PRRequests/PRRequestDetail";

const MainLayout = () => {
  // Central Employee Master hydration — MainLayout mounts exactly once per
  // authenticated session (it sits inside ProtectedRoute, and route changes
  // only swap its children), so this is the one place that guarantees
  // employees_v6 starts hydrating as early as possible, without every
  // rate-dependent consumer (Team Assigned, Expense Budget) needing its own
  // copy of this same load call. loadEmployeesForApp() already de-dupes
  // concurrent callers and never throws — a failed hydration here leaves
  // the cache exactly as it was, same best-effort contract every other
  // caller already relies on.
  useEffect(() => {
    loadEmployeesForApp().catch(() => {});
  }, []);

  return (
    <GlobalReminderProvider>
    <div className="flex min-h-screen bg-slate-100 animate-pmo-fade-up">

      {/* Sidebar */}
      <Sidebar />

      {/* Right Content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">

        {/* Navbar */}
        <Navbar />

        {/* Page Content — deliberately has no overflow property. html/body is
            the single intended scroll container for the whole app (nothing
            constrains html/body/#root to the viewport, so the page grows and
            scrolls naturally with content — this is also why Sidebar has no
            explicit height and instead stretches to match the full document
            height). Neither this <main> nor its ancestors have a definite
            height (only min-h-screen floors), so an overflow-auto/overflow-y
            here never has a real bounded box to scroll within; at best it's
            inert, at worst sub-pixel flex-stretch rounding makes its content
            appear a hair taller than its own box, producing a second, barely
            usable scrollbar right next to the real one. Do not add
            overflow-auto/overflow-y-auto back here without also giving this
            element (and every ancestor up to here) a definite height (h-screen/
            h-dvh, not min-h-screen) plus min-h-0 — otherwise this duplicate-
            scrollbar bug reappears. */}
        <main className="flex-1 min-w-0 bg-[#F8FAFC] dark:bg-[#0B0F19] transition-colors duration-300">
          {/* Fluid container: padding scales smoothly with viewport width/height
              instead of jumping at fixed breakpoints, and the max-width ceiling
              rises on very large monitors so content doesn't feel starved of
              space on 2K/4K while still avoiding unreadably wide rows on a
              1366px laptop. */}
          <div className="w-full max-w-[1800px] 2xl:max-w-[2200px] mx-auto px-[clamp(1rem,2vw,2.5rem)] py-[clamp(1rem,1.5vh,2rem)]">
            <Routes>

              {/* Dashboard */}
              <Route
                path="/"
                element={<ModuleRoute module="Dashboard"><Dashboard /></ModuleRoute>}
              />
              <Route
                path="/dashboard"
                element={<ModuleRoute module="Dashboard"><Dashboard /></ModuleRoute>}
              />

              {/* ===========================
                  PROJECTS
              ============================ */}

              <Route
                path="/projects"
                element={<ModuleRoute module="Projects"><Projects /></ModuleRoute>}
              />

              <Route
                path="/projects/completed"
                element={<ModuleRoute module="Projects"><CompletedProjects /></ModuleRoute>}
              />

              <Route
                path="/projects/archived"
                element={<ModuleRoute module="Projects"><ArchivedProjects /></ModuleRoute>}
              />

              <Route
                path="/projects/financial-loss"
                element={<ModuleRoute module="Projects"><FinancialLossProjects /></ModuleRoute>}
              />

              <Route
                path="/projects/timeline-alerts"
                element={<ModuleRoute module="Projects"><TimelineAlertProjects /></ModuleRoute>}
              />

              <Route
                path="/projects/timesheet-pending"
                element={<ModuleRoute module="Projects"><TimesheetPendingProjects /></ModuleRoute>}
              />

              <Route
                path="/projects/team-leads-workload"
                element={
                  <ModuleRoute module="Projects">
                    <TeamLeadsWorkloadProjects />
                  </ModuleRoute>
                }
              />

              <Route
                path="/projects/add"
                element={<ModuleRoute module="Projects"><AddProject /></ModuleRoute>}
              />

              <Route
                path="/projects/view/:id"
                element={<ModuleRoute module="Projects"><ViewProject /></ModuleRoute>}
              />

              <Route
                path="/projects/edit/:id"
                element={<ModuleRoute module="Projects"><EditProject /></ModuleRoute>}
              />

              {/* Dedicated read-only Notes register — gated by the same
                  "Projects" module access as everything else above, since
                  a note only ever exists under a project. No separate
                  Notes module/permission. */}
              <Route
                path="/notes"
                element={
                  <ModuleRoute module="Projects">
                    <Notes />
                  </ModuleRoute>
                }
              />

              {/* ===========================
                  CUSTOMER MASTER
              ============================ */}

              <Route
                path="/customers"
                element={<ModuleRoute module="Customer Master"><CustomerMaster /></ModuleRoute>}
              />

              {/* ===========================
                  OTHER MODULES
              ============================ */}

              <Route
                path="/manpower"
                element={<ModuleRoute module="Manpower"><Manpower /></ModuleRoute>}
              />

              <Route
                path="/timesheets"
                element={<ModuleRoute module="Timesheets"><Timesheets /></ModuleRoute>}
              />

              <Route
                path="/reports"
                element={<ModuleRoute module="Reports"><ReportsPage /></ModuleRoute>}
              />

              <Route
                path="/settings"
                element={<ModuleRoute module="Settings"><Settings /></ModuleRoute>}
              />

              <Route
                path="/settings/weekly-emails/:notification/preview"
                element={<ModuleRoute module="Settings"><Suspense fallback={pageFallback}><WeeklyEmailPreviewPage /></Suspense></ModuleRoute>}
              />

              <Route
                path="/settings/weekly-emails/:notification/runs"
                element={<ModuleRoute module="Settings"><Suspense fallback={pageFallback}><WeeklyEmailRunsPage /></Suspense></ModuleRoute>}
              />

              {/* ===========================
                  PR REQUEST & TWO-LEVEL APPROVAL WORKFLOW
              ============================ */}

              <Route
                path="/pr-requests"
                element={<ModuleRoute module="Approvals"><PRRequests /></ModuleRoute>}
              />

              <Route
                path="/pr-requests/new"
                element={<ModuleRoute module="Approvals"><RequestPR /></ModuleRoute>}
              />

              <Route
                path="/pr-requests/:id/edit"
                element={<ModuleRoute module="Approvals"><RequestPR /></ModuleRoute>}
              />

              <Route
                path="/pr-requests/:id"
                element={<ModuleRoute module="Approvals"><PRRequestDetail /></ModuleRoute>}
              />

              {/* Wildcard Fallback */}
              <Route
                path="*"
                element={<ModuleRoute module="Dashboard"><Dashboard /></ModuleRoute>}
              />
            </Routes>
          </div>
        </main>

      </div>
      <PmoAssistant />
    </div>
    </GlobalReminderProvider>
  );
};

export default MainLayout;
