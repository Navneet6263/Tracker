// Auth guard – wraps any page that needs a logged-in user.
// Usage: wrap the component inside any route with <AuthGuard>...</AuthGuard>
import { useEffect, useState, type ReactNode } from "react";
import { isLoggedIn } from "@/lib/api";

export function AuthGuard({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.replace("/login");
    } else {
      setChecked(true);
    }
  }, []);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <span className="text-sm text-slate-400 animate-pulse">Loading…</span>
      </div>
    );
  }

  return <>{children}</>;
}
