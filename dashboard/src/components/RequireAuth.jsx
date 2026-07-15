import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function RequireAuth({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/me" replace />;
  return children;
}
