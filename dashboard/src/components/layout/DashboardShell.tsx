import { Activity, LayoutDashboard, LogOut, Menu, Search, Settings, ShieldCheck, Users, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { fetchSummary, getMe, logout, type EmployeeSummary, type MeResponse } from "@/lib/api";
import { NotificationCenter } from "./NotificationCenter";

const nav = [
  { icon: LayoutDashboard, label: "Overview", href: "/#overview", hash: "#overview" },
  { icon: Users, label: "Employees", href: "/#employees", hash: "#employees" },
  { icon: Activity, label: "Activity", href: "/#activity", hash: "#activity" },
  { icon: Settings, label: "Settings", href: "/#settings", hash: "#settings" },
];

function minutesSince(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const normalized = value.endsWith("Z") || value.includes("+") ? value : `${value}Z`;
  return (Date.now() - new Date(normalized).getTime()) / 60_000;
}

export function DashboardShell({
  children,
  employees,
}: {
  children: ReactNode;
  employees?: EmployeeSummary[];
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [activeHash, setActiveHash] = useState("#overview");
  const [fetchedDirectory, setFetchedDirectory] = useState<EmployeeSummary[]>([]);
  const [currentUser, setCurrentUser] = useState<MeResponse | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    getMe()
      .then((me) => setCurrentUser(me))
      .catch(() => undefined);
  }, []);




  useEffect(() => {
    const syncHash = () => setActiveHash(window.location.hash || "#overview");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (employees) return;
    let cancelled = false;
    const refresh = () => {
      fetchSummary()
        .then((employees) => {
          if (!cancelled) setFetchedDirectory(employees);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [employees]);

  const directory = employees ?? fetchedDirectory;

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return directory
      .filter((employee) =>
        [
          employee.name,
          employee.email,
          employee.current_app ?? "",
          employee.shift?.name ?? "",
        ].some((value) => value.toLowerCase().includes(needle)),
      )
      .slice(0, 8);
  }, [directory, query]);

  return (

    <div className="min-h-screen bg-[#f7f7f5] text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200/70 bg-white px-4 py-6 lg:block">
        <a href="/#overview" className="mb-8 flex items-center gap-2 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Sentinel</p>
            <p className="text-[11px] text-slate-500">Workforce Insights</p>
          </div>
        </a>
        <nav className="space-y-1">
          {nav.map((item) => {
            const active = pathname === "/" && activeHash === item.hash;
            return (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => {
                  if (pathname === "/") {
                    e.preventDefault();
                    window.location.hash = item.hash;
                    setActiveHash(item.hash);
                  }
                }}
                className={`flex cursor-pointer w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-indigo-50 text-indigo-700 font-semibold shadow-xs" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
                {item.hash === "#employees" && directory.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                    {directory.length}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
        <div className="absolute inset-x-4 bottom-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 p-4 text-white">
          <p className="text-xs font-semibold">Privacy-first tracking</p>
          <p className="mt-1 text-[11px] text-slate-300">
            App, call and shift metadata only. No screenshots or audio recording.
          </p>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white px-5 py-6">
            <div className="flex items-center justify-between mb-8">
              <a href="/#overview" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-tight">Sentinel</p>
                  <p className="text-[11px] text-slate-500">Workforce Insights</p>
                </div>
              </a>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-1.5 flex-1">
              {nav.map((item) => {
                const active = pathname === "/" && activeHash === item.hash;
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={(e) => {
                      if (pathname === "/") {
                        e.preventDefault();
                        window.location.hash = item.hash;
                        setActiveHash(item.hash);
                      }
                      setMobileOpen(false);
                    }}
                    className={`flex cursor-pointer w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      active ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </div>
                    {item.hash === "#employees" && directory.length > 0 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {directory.length}
                      </span>
                    )}
                  </a>
                );
              })}
            </nav>
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 p-4 text-white">
              <p className="text-xs font-semibold">Privacy-first tracking</p>
              <p className="mt-1 text-[11px] text-slate-300">
                App, call and shift metadata only. No screenshots or audio recording.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200/70 bg-[#f7f7f5]/80 px-4 sm:px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3 w-full max-w-md">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden cursor-pointer grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResults[0]) {
                  window.location.href = `/employees/${searchResults[0].id}`;
                }
              }}
              placeholder="Search employees, apps or shifts..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
            {searchOpen && query.trim() && (
              <div className="absolute left-0 right-0 top-11 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                {searchResults.length ? (
                  searchResults.map((employee) => (
                    <a
                      key={employee.id}
                      href={`/employees/${employee.id}`}
                      className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-0 hover:bg-slate-50"
                    >
                      <span>
                        <span className="block font-medium text-slate-900">{employee.name}</span>
                        <span className="block text-xs text-slate-500">{employee.email}</span>
                      </span>
                      <span className="text-xs text-indigo-600">
                        {employee.shift?.name ?? "Learning shift"}
                      </span>
                    </a>
                  ))
                ) : (
                  <p className="px-4 py-3 text-xs text-slate-500">No matching employee found.</p>
                )}
              </div>
            )}
            </div>
          </div>
          <div className="relative flex items-center gap-3">
            <NotificationCenter directory={directory} />

            {/* Profile Avatar & Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((prev) => !prev)}
                className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-xs font-semibold text-white shadow-xs cursor-pointer hover:ring-2 hover:ring-indigo-300 transition"
                title="Admin Account"
              >
                {currentUser?.name
                  ? currentUser.name
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()
                  : "AD"}
              </button>

              {profileOpen && (
                <div
                  onMouseLeave={() => setProfileOpen(false)}
                  className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <p className="text-xs font-bold text-slate-900">{currentUser?.name || "Administrator"}</p>
                    <p className="text-[11px] text-slate-500 truncate">{currentUser?.email || "admin@company.com"}</p>
                    <span className="mt-1 inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 capitalize">
                      <ShieldCheck className="h-3 w-3" /> {currentUser?.role || "Super Admin"}
                    </span>
                  </div>


                  <div className="py-1">
                    <a
                      href="/#settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition"
                    >
                      <Settings className="h-3.5 w-3.5" /> Shift & System Rules
                    </a>
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        window.location.href = "/login";
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Logout Session
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>


        </header>
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
