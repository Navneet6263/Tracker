import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { RequireAuth } from "./components/RequireAuth";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import EmployeeDetail from "./pages/EmployeeDetail";
import MyStats from "./pages/MyStats";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-surface text-white">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <>
                  <Navbar />
                  <main className="max-w-6xl mx-auto">
                    <Routes>
                      <Route path="/" element={<Navigate to="/me" replace />} />
                      <Route
                        path="/admin"
                        element={
                          <RequireAuth role="admin">
                            <AdminDashboard />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/admin/employee/:id"
                        element={
                          <RequireAuth role="admin">
                            <EmployeeDetail />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/me"
                        element={
                          <RequireAuth>
                            <MyStats />
                          </RequireAuth>
                        }
                      />
                    </Routes>
                  </main>
                </>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
