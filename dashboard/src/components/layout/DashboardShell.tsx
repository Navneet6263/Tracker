import { Activity, Bell, LayoutDashboard, Search, Settings, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { fetchSummary, type EmployeeSummary } from "@/lib/api";

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
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

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

  const notifications = useMemo(
    () =>
      directory
        .flatMap((employee) => {
          const age = minutesSince(employee.last_ping);
          if (employee.current_state !== "off_shift" && age > 5) {
            return [{ employee, message: age > 15 ? "Tracker is not reporting" : "Went offline" }];
          }
          if (employee.current_state === "locked") {
            return [{ employee, message: "Screen is currently locked" }];
          }
          return [];
        })
        .slice(0, 10),
    [directory],
  );

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-slate-900">
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
                onClick={() => setActiveHash(item.hash)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
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

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200/70 bg-[#f7f7f5]/80 px-6 py-4 backdrop-blur">
          <div className="relative w-full max-w-md">
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
          <div className="relative flex items-center gap-3">
            <button
              type="button"
              aria-label="Open notifications"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="relative grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              <Bell className="h-4 w-4" />
              {notifications.length > 0 && (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {notifications.length}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div className="absolute right-12 top-11 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">Notifications</p>
                  <p className="text-xs text-slate-500">Live tracker attention items</p>
                </div>
                {notifications.length ? (
                  notifications.map(({ employee, message }) => (
                    <a
                      key={`${employee.id}:${message}`}
                      href={`/employees/${employee.id}`}
                      className="block border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"
                    >
                      <p className="text-xs font-medium text-slate-900">{employee.name}</p>
                      <p className="mt-0.5 text-xs text-rose-600">{message}</p>
                    </a>
                  ))
                ) : (
                  <p className="px-4 py-5 text-center text-xs text-emerald-700">
                    All trackers are reporting normally.
                  </p>
                )}
              </div>
            )}
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
