import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Login from "./pages/Login/Login";
import ChangePassword from "./pages/ChangePassword/ChangePassword";
import ResetPassword from "./pages/ResetPassword/ResetPassword";
import { AuthProvider } from "./auth/authContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import { PmoToastProvider } from "./components/ui/PmoToastProvider";

function App() {
  return (
    <AuthProvider>
      {/* Mounted once at the app root, outside BrowserRouter's <Routes> — so
          it's available on every route including Login/ChangePassword/
          ResetPassword, which render outside MainLayout and therefore
          outside PmoAssistant/GlobalReminderProvider's scope. This is the
          ONE generic action-feedback toast system (success/error/warning/
          info for things like "Project updated successfully") — entirely
          separate from the business Notification Bell/Drawer and from the
          reminder-toast system, neither of which this touches. */}
      <PmoToastProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Reachable with no session — a brand-new forced-first-login
              user has no JWT yet, so this can't sit behind ProtectedRoute.
              The page self-guards (see ChangePassword.tsx) instead. */}
          <Route path="/auth/change-password" element={<ChangePassword />} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
      </PmoToastProvider>
    </AuthProvider>
  );
}

export default App;
