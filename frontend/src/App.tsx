import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Login from "./pages/Login/Login";
import ChangePassword from "./pages/ChangePassword/ChangePassword";
import ResetPassword from "./pages/ResetPassword/ResetPassword";
import { AuthProvider } from "./auth/authContext";
import ProtectedRoute from "./auth/ProtectedRoute";

function App() {
  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}

export default App;
