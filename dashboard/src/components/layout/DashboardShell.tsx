import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Bell, Search, LayoutDashboard, Users, Camera, Settings } from "lucide-react";
import { useState, type ReactNode } from "react";

const nav = [
  { icon: LayoutDashboard, label: "Overview", to: "/" },
  { icon: Users, label: "Employees", to: "#employees" },
  { icon: Camera, label: "Screenshots", to: "#screenshots" },
  { icon: Settings, label: "Settings", to: "#settings" },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [activeHash, setActiveHash] = useState<string>("/");
  const isActive = (to: string) =>
    to.startsWith("#") ? activeHash === to : pathname === to && activeHash === "/";
  return (
    <div className="min-h-screen bg-[#f7f7f5] text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200/70 bg-white px-4 py-6 lg:block">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Sentinel</p>
            <p className="text-[11px] text-slate-500">Workforce Insights</p>
          </div>
        </Link>
        <nav className="space-y-1">
          {nav.map((n) => {
            const active = isActive(n.to);
            const cls = `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
              active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
            }`;
            if (n.to.startsWith("#")) {
              return (
                <button key={n.label} onClick={() => setActiveHash(n.to)} className={cls}>
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </button>
              );
            }
            return (
              <Link key={n.label} to={n.to} onClick={() => setActiveHash("/")} className={cls}>
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-4 bottom-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 p-4 text-white">
          <p className="text-xs font-semibold">Upgrade to Pro</p>
          <p className="mt-1 text-[11px] text-slate-300">Add mobile call & app tracking.</p>
          <button className="mt-3 w-full rounded-lg bg-white/10 py-1.5 text-xs font-medium ring-1 ring-white/20 hover:bg-white/20">
            Learn more
          </button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200/70 bg-[#f7f7f5]/80 px-6 py-4 backdrop-blur">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search employees, incidents, sessions…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="relative grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500" />
            </button>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-xs font-semibold text-white">
              AD
            </div>
          </div>
        </header>
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
