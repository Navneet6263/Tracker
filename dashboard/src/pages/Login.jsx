import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login as apiLogin, getMe } from "../api/client";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const { data } = await apiLogin(email, password);
      // Save token temporarily so getMe can use it via interceptor
      localStorage.setItem("token", data.access_token);
      
      const me = await getMe();
      login(data.access_token, me.data);
      navigate(me.data.role === "admin" ? "/admin" : "/me");
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
        <p className="text-slate-400 text-sm mb-6">Sign in to your account</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-surface border border-border rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-brand transition"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-surface border border-border rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-brand transition"
            required
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            className="bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-xl transition"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
