import { Routes, Route } from "react-router-dom";

import Sidebar from "../components/Sidebar/Sidebar";
import Navbar from "../components/Navbar/Navbar";
import { GlobalReminderProvider } from "../notifications/GlobalReminderProvider";

import Dashboard from "../pages/Dashboard/Dashboard";

/* Projects */
import Projects from "../pages/Projects/Projects";
import CompletedProjects from "../pages/Projects/CompletedProjects";
import AddProject from "../pages/Projects/AddProject";
import ViewProject from "../pages/Projects/ViewProject";
import EditProject from "../pages/Projects/EditProject";

/* Customer Master */
import CustomerMaster from "../pages/CustomerMaster/CustomerMaster";

/* Invoices */
import Invoices from "../pages/Invoices/Invoices";
import AddInvoice from "../pages/Invoices/AddInvoice";
import ViewInvoice from "../pages/Invoices/ViewInvoice";
import EditInvoice from "../pages/Invoices/EditInvoice";

/* Other Modules */
import Manpower from "../pages/Manpower/Manpower";
import Timesheets from "../pages/Timesheets/Timesheets";
import Expenses from "../pages/Expenses/Expenses";
import Reports from "../pages/Reports/Reports";
import Resources from "../pages/Resources/Resources";
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

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-[#F8FAFC] dark:bg-[#0B0F19] transition-colors duration-300">
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
                  INVOICES
              ============================ */}

              <Route
                path="/invoices"
                element={<Invoices />}
              />

              <Route
                path="/invoices/add"
                element={<AddInvoice />}
              />

              <Route
                path="/invoices/view/:id"
                element={<ViewInvoice />}
              />

              <Route
                path="/invoices/edit/:id"
                element={<EditInvoice />}
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
                path="/expenses"
                element={<Expenses />}
              />

              <Route
                path="/reports"
                element={<Reports />}
              />

              <Route
                path="/resources"
                element={<Resources />}
              />

              <Route
                path="/settings"
                element={<Settings />}
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