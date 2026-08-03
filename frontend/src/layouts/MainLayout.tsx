import { Routes, Route } from "react-router-dom";

import Sidebar from "../components/Sidebar/Sidebar";
import Navbar from "../components/Navbar/Navbar";
import { GlobalReminderProvider } from "../notifications/GlobalReminderProvider";

import Dashboard from "../pages/Dashboard/Dashboard";

/* Projects */
import Projects from "../pages/Projects/Projects";
import CompletedProjects from "../pages/Projects/CompletedProjects";
import FinancialLossProjects from "../pages/Projects/FinancialLossProjects";
import TimelineAlertProjects from "../pages/Projects/TimelineAlertProjects";
import AddProject from "../pages/Projects/AddProject";
import ViewProject from "../pages/Projects/ViewProject";
import EditProject from "../pages/Projects/EditProject";

/* Customer Master */
import CustomerMaster from "../pages/CustomerMaster/CustomerMaster";

/* Other Modules */
import Manpower from "../pages/Manpower/Manpower";
import Timesheets from "../pages/Timesheets/Timesheets";
import Reports from "../pages/Reports/Reports";
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
                element={<Dashboard />}
              />
              <Route
                path="/dashboard"
                element={<Dashboard />}
              />

              {/* ===========================
                  PROJECTS
              ============================ */}

              <Route
                path="/projects"
                element={<Projects />}
              />

              <Route
                path="/projects/completed"
                element={<CompletedProjects />}
              />

              <Route
                path="/projects/financial-loss"
                element={<FinancialLossProjects />}
              />

              <Route
                path="/projects/timeline-alerts"
                element={<TimelineAlertProjects />}
              />

              <Route
                path="/projects/add"
                element={<AddProject />}
              />

              <Route
                path="/projects/view/:id"
                element={<ViewProject />}
              />

              <Route
                path="/projects/edit/:id"
                element={<EditProject />}
              />

              {/* ===========================
                  CUSTOMER MASTER
              ============================ */}

              <Route
                path="/customers"
                element={<CustomerMaster />}
              />

              {/* ===========================
                  OTHER MODULES
              ============================ */}

              <Route
                path="/manpower"
                element={<Manpower />}
              />

              <Route
                path="/timesheets"
                element={<Timesheets />}
              />

              <Route
                path="/reports"
                element={<Reports />}
              />

              <Route
                path="/settings"
                element={<Settings />}
              />

              {/* Wildcard Fallback */}
              <Route
                path="*"
                element={<Dashboard />}
              />
            </Routes>
          </div>
        </main>

      </div>

    </div>
    </GlobalReminderProvider>
  );
};

export default MainLayout;