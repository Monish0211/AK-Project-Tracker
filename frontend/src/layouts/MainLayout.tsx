import { Routes, Route } from "react-router-dom";

import Sidebar from "../components/Sidebar/Sidebar";
import Navbar from "../components/Navbar/Navbar";
import { GlobalReminderProvider } from "../notifications/GlobalReminderProvider";
import { ModuleRoute } from "../auth/ModuleRoute";
import { PmoAssistant } from "../components/PmoAssistant/PmoAssistant";

import Dashboard from "../pages/Dashboard/Dashboard";

/* Projects */
import Projects from "../pages/Projects/Projects";
import CompletedProjects from "../pages/Projects/CompletedProjects";
import ArchivedProjects from "../pages/Projects/ArchivedProjects";
import FinancialLossProjects from "../pages/Projects/FinancialLossProjects";
import TimelineAlertProjects from "../pages/Projects/TimelineAlertProjects";
import TimesheetPendingProjects from "../pages/Projects/TimesheetPendingProjects";
import AddProject from "../pages/Projects/AddProject";
import ViewProject from "../pages/Projects/ViewProject";
import EditProject from "../pages/Projects/EditProject";

/* Customer Master */
import CustomerMaster from "../pages/CustomerMaster/CustomerMaster";

/* Other Modules */
import Manpower from "../pages/Manpower/Manpower";
import Timesheets from "../pages/Timesheets/Timesheets";
import ReportsPage from "../pages/ReportsPage";
import Settings from "../pages/Settings/Settings";

const MainLayout = () => {
  return (
    <GlobalReminderProvider>
    <div className="flex min-h-screen bg-slate-100 animate-pmo-fade-up">

      {/* Sidebar */}
      <Sidebar />

      {/* Right Content */}
      <div className="flex-1 flex flex-col min-h-screen">

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
        <main className="flex-1 bg-[#F8FAFC] dark:bg-[#0B0F19] transition-colors duration-300">
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
