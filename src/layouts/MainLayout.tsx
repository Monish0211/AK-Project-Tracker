import { Routes, Route } from "react-router-dom";

import Sidebar from "../components/Sidebar/Sidebar";
import Navbar from "../components/Navbar/Navbar";

import Dashboard from "../pages/Dashboard/Dashboard";

/* Projects */
import Projects from "../pages/Projects/Projects";
import AddProject from "../pages/Projects/AddProject";
import ViewProject from "../pages/Projects/ViewProject";
import EditProject from "../pages/Projects/EditProject";

/* Invoices */
import Invoices from "../pages/Invoices/Invoices";
import AddInvoice from "../pages/Invoices/AddInvoice";
import ViewInvoice from "../pages/Invoices/ViewInvoice";
import EditInvoice from "../pages/Invoices/EditInvoice";

/* Other Modules */
import Deliverables from "../pages/Deliverables/Deliverables";
import Manpower from "../pages/Manpower/Manpower";
import Timesheets from "../pages/Timesheets/Timesheets";
import Expenses from "../pages/Expenses/Expenses";
import Reports from "../pages/Reports/Reports";
import Documents from "../pages/Documents/Documents";
import Resources from "../pages/Resources/Resources";
import Settings from "../pages/Settings/Settings";

const MainLayout = () => {
  return (
    <div className="flex min-h-screen bg-slate-100">

      {/* Sidebar */}
      <Sidebar />

      {/* Right Content */}
      <div className="flex-1 flex flex-col min-h-screen">

        {/* Navbar */}
        <Navbar />

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">

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
              path="/deliverables"
              element={<Deliverables />}
            />

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
              path="/documents"
              element={<Documents />}
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

        </main>

      </div>

    </div>
  );
};

export default MainLayout;