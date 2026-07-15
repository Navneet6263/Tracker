import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="h-14 bg-card border-b border-border flex items-center px-6 justify-between">
      <Link to="/" className="text-white font-semibold text-lg tracking-tight">
        🔍 Tracker
      </Link>
      <div className="flex items-center gap-4">
        {user?.role === "admin" && (
          <Link to="/admin" className="text-slate-400 hover:text-white text-sm transition">
            Admin
          </Link>
        )}
        <Link to="/me" className="text-slate-400 hover:text-white text-sm transition">
          My Stats
        </Link>
        <button
          onClick={handleLogout}
          className="text-xs bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
