import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Clock,
  Gauge,
  Headphones,
  LogOut,
  Users,
  ShieldCheck,
  Database,
  Lock,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  Sparkles,
  Download,
  Activity,
  Layers,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { ChangePasswordDialog } from "@/components/dashboard/ChangePasswordDialog";
import { EmployeeTable } from "@/components/dashboard/EmployeeTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { TimeSavingsBanner } from "@/components/dashboard/TimeSavingsBanner";
import { WorkDeclines } from "@/components/dashboard/WorkDeclines";
import { ActivityIndicators } from "@/components/dashboard/ActivityIndicators";
import { StatusPing } from "@/components/dashboard/StatusPing";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getPingStatus, formatPing, useLiveSignals, useSummary } from "@/hooks/useRealData";
import { AuthGuard } from "@/lib/auth-guard";
import { getMe, logout, type MeResponse } from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sentinel · Workforce Activity" },
      {
        name: "description",
        content: "Privacy-first work, application, shift and VoIP activity analytics.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

type TabType = "overview" | "employees" | "activity" | "settings";

function DashboardContent() {
  const navigate = useNavigate();
  const { data: employees, loading, error, refetch } = useSummary();
  const [adminId, setAdminId] = useState<number | null>(null);
  const [adminUser, setAdminUser] = useState<MeResponse | null>(null);
  const liveSignals = useLiveSignals(adminId);

  // Tab state synced with URL hash (sidebar is primary navigation)
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (typeof window === "undefined") return "overview";
    const hash = window.location.hash.replace("#", "") as TabType;
    return ["overview", "employees", "activity", "settings"].includes(hash) ? hash : "overview";
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "") as TabType;
      if (["overview", "employees", "activity", "settings"].includes(hash)) {
        setActiveTab(hash);
      } else {
        setActiveTab("overview");
      }
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const switchTab = (tab: TabType) => {
    window.location.hash = `#${tab}`;
    setActiveTab(tab);
  };

  useEffect(() => {
    getMe()
      .then((me) => {
        setAdminId(me.id);
        setAdminUser(me);
      })
      .catch(() => undefined);
  }, []);


  const total = employees.length;
  const statuses = employees.map((employee) =>
    getPingStatus(employee.active_hours, employee.last_ping, employee.current_state),
  );
  const active = statuses.filter((status) =>
    ["active", "passive", "meeting"].includes(status),
  ).length;
  const anomalyCount = statuses.filter((status) => status === "tamper").length;
  const averageScore = total
    ? Math.round(employees.reduce((sum, employee) => sum + employee.productivity_score, 0) / total)
    : 0;
  const totalHours = employees.reduce((sum, employee) => sum + employee.active_hours, 0);
  const meetingHours = employees.reduce((sum, employee) => sum + employee.meeting_hours, 0);

  // Active team members right now (for Activity view)
  const activeTeam = useMemo(() => {
    return employees.filter((e) => {
      const status = getPingStatus(e.active_hours, e.last_ping, e.current_state);
      return status === "active" || status === "meeting" || status === "passive";
    });
  }, [employees]);

  // Aggregate application usage across active team (for Activity view)
  const appUsageSummary = useMemo(() => {
    const appCounts: Record<string, number> = {};
    for (const e of employees) {
      if (e.current_app) {
        const app = e.current_app.trim();
        appCounts[app] = (appCounts[app] || 0) + 1;
      }
    }
    const totalApps = Object.values(appCounts).reduce((a, b) => a + b, 0);
    return Object.entries(appCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({
        name,
        count,
        pct: totalApps ? Math.round((count / totalApps) * 100) : 0,
      }));
  }, [employees]);

  if (loading) {
    return (
      <DashboardShell employees={employees}>
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          Loading team data…
        </div>
      </DashboardShell>
    );
  }

  if (error) {
    if (error.includes("401")) {
      window.location.replace("/login");
      return null;
    }
    return (
      <DashboardShell employees={employees}>
        <div className="flex h-64 items-center justify-center text-sm text-rose-500">
          Cannot reach the activity service: {error}
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell employees={employees}>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* ─────────────────────────────────────────────────────────────
            VIEW 1: OVERVIEW TAB (Dashboard summary + Top 5 Performers)
           ───────────────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div id="overview" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
                  Admin overview
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Workforce Dashboard
                </h1>
                <p className="text-sm text-slate-500">
                  Real-time workforce health, application usage, client calls and top active performers.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <ChangePasswordDialog />
                <button
                  onClick={() => {
                    logout();
                    navigate({ to: "/login" });
                  }}
                  className="cursor-pointer flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-rose-600"
                >
                  <LogOut className="h-3.5 w-3.5" /> Logout
                </button>
              </div>
            </div>

            <AlertBanner anomalyCount={anomalyCount} />
            <TimeSavingsBanner employees={employees} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Currently working"
                value={`${active}/${total}`}
                hint="Input, passive work or active calls"
                icon={Users}
                tone="success"
              />
              <StatCard
                label="Avg productivity"
                value={`${averageScore}%`}
                hint="Productive time / verified work time"
                icon={Gauge}
              />
              <StatCard
                label="Verified work today"
                value={`${totalHours.toFixed(1)}h`}
                hint="Excludes idle, lock and off-shift time"
                icon={Clock}
              />
              <StatCard
                label="VoIP/client calls"
                value={`${meetingHours.toFixed(1)}h`}
                hint="Meet, Zoom, Teams, Webex and configured VoIP"
                icon={Headphones}
              />
            </div>

            {/* Curated Top 5 Performers (Instead of dumping 300 employees) */}
            <EmployeeTable
              compact
              employees={employees}
              liveSignals={liveSignals}
              onViewAll={() => switchTab("employees")}
            />

            <div>
              <WorkDeclines />
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            VIEW 2: EMPLOYEES TAB (Full Directory with Search & Pagination)
           ───────────────────────────────────────────────────────────── */}
        {activeTab === "employees" && (
          <div id="employees" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
                  Team management
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Workforce Directory
                </h1>
                <p className="text-sm text-slate-500">
                  Full directory of all {total} employees with live search, status filters, and instant pagination.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <ChangePasswordDialog />
                <button
                  onClick={() => {
                    logout();
                    navigate({ to: "/login" });
                  }}
                  className="cursor-pointer flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-rose-600"
                >
                  <LogOut className="h-3.5 w-3.5" /> Logout
                </button>
              </div>
            </div>

            <EmployeeTable
              employees={employees}
              liveSignals={liveSignals}
              onDeleted={() => refetch(true)}
            />
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            VIEW 3: ACTIVITY TAB (Signals, telemetry, live apps & declines)
           ───────────────────────────────────────────────────────────── */}
        {activeTab === "activity" && (
          <div id="activity" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
                  Live telemetry
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Workforce Activity & Signals
                </h1>
                <p className="text-sm text-slate-500">
                  Real-time active signals, foreground application usage, and unattended workstation alerts.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {active} active right now
                </span>
                <ChangePasswordDialog />
              </div>
            </div>

            <AlertBanner anomalyCount={anomalyCount} />
            <TimeSavingsBanner employees={employees} />

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Active right now"
                value={`${active}/${total}`}
                hint="Desktop agent sending signals"
                icon={Users}
                tone="success"
              />
              <StatCard
                label="Team productivity"
                value={`${averageScore}%`}
                hint="Average score across shifts"
                icon={Gauge}
              />
              <StatCard
                label="Work logged today"
                value={`${totalHours.toFixed(1)}h`}
                hint="Total verified computer usage"
                icon={Clock}
              />
              <StatCard
                label="VoIP & meeting hours"
                value={`${meetingHours.toFixed(1)}h`}
                hint="Teams, Zoom, Meet & client calls"
                icon={Headphones}
              />
            </div>

            {/* Two Column Layout: Currently Active Applications + Top App Breakdown */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Left 2 Cols: Live Working Team Cards */}
              <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-indigo-600" />
                    <h2 className="text-sm font-semibold text-slate-900">
                      Live Applications in Focus ({activeTeam.length})
                    </h2>
                  </div>
                  <span className="text-xs text-slate-400">Updates live every 30s</span>
                </div>

                {activeTeam.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">
                    No employees currently active on workstations.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeTeam.slice(0, 10).map((emp) => {
                      const status = getPingStatus(emp.active_hours, emp.last_ping, emp.current_state);
                      const live = liveSignals[emp.id];
                      const liveInput = live?.inputs
                        ? {
                            is_keyboard_active: live.inputs.keyboard,
                            is_mouse_active: live.inputs.mouse,
                          }
                        : undefined;
                      const initials = emp.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase();

                      return (
                        <div
                          key={emp.id}
                          className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 transition hover:bg-slate-50 hover:border-slate-200"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white shadow-xs">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-xs text-slate-900 truncate">
                                {emp.name}
                              </p>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <span className="inline-block rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-slate-200/80 truncate">
                                  {emp.current_app || "Active Session"}
                                </span>
                              </div>
                              {emp.current_device && (
                                <p className="mt-0.5 text-[10px] font-mono text-slate-400 truncate">
                                  PC: {emp.current_device}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <StatusPing status={status} label={formatPing(emp.last_ping)} />
                            <ActivityIndicators input={liveInput} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right 1 Col: Top Applications Breakdown */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                    <Layers className="h-4 w-4 text-indigo-600" />
                    <h2 className="text-sm font-semibold text-slate-900">Top Applications Today</h2>
                  </div>

                  {appUsageSummary.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">
                      No application usage recorded today yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {appUsageSummary.map((item, idx) => (
                        <div key={item.name} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-700 flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-indigo-500" />
                              {item.name}
                            </span>
                            <span className="font-semibold text-slate-500 tabular-nums">
                              {item.pct}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                              style={{ width: `${item.pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 rounded-xl bg-indigo-50/60 p-3 text-[11px] text-indigo-900 border border-indigo-100/60">
                  <p className="font-semibold">VoIP & App Tracking Policy</p>
                  <p className="mt-0.5 text-indigo-700">
                    Captures active process names and call presence for Teams, Zoom, Meet, and Edge without storing keystrokes or audio.
                  </p>
                </div>
              </div>
            </div>

            {/* Work Declines Table */}
            <div>
              <WorkDeclines />
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            VIEW 4: SETTINGS TAB (Admin credentials, security & rules)
           ───────────────────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div id="settings" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
                  Administration
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  System & Admin Settings
                </h1>
                <p className="text-sm text-slate-500">
                  Account security, working shift rules, desktop agent installer, and privacy compliance.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <ChangePasswordDialog />
                <button
                  onClick={() => {
                    logout();
                    navigate({ to: "/login" });
                  }}
                  className="cursor-pointer flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-rose-600"
                >
                  <LogOut className="h-3.5 w-3.5" /> Logout
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Card 1: Admin Profile & Credentials */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Admin Account</h2>
                    <p className="text-xs text-slate-500">Logged in administrator session</p>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Email:</span>
                    <span className="font-semibold text-slate-800">{adminUser?.email || "admin@company.com"}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Role:</span>
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 capitalize">
                      {adminUser?.role || "Super Administrator"}
                    </span>
                  </div>

                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Password status:</span>
                    <span className="font-medium text-emerald-600">Protected (Bcrypt 12 rounds)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Session mode:</span>
                    <span className="font-medium text-slate-700">Localhost JWT Authenticated</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <ChangePasswordDialog />
                  <button
                    onClick={() => {
                      logout();
                      navigate({ to: "/login" });
                    }}
                    className="cursor-pointer rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
                  >
                    Logout Session
                  </button>
                </div>
              </div>

              {/* Card 2: Shift & Attendance Rules */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Shift & Attendance Rules</h2>
                    <p className="text-xs text-slate-500">Working hours and idle thresholds</p>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Day Shift:</span>
                    <span className="font-semibold text-slate-800">09:00 AM – 06:00 PM (Asia/Kolkata)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Night Shift:</span>
                    <span className="font-semibold text-slate-800">08:00 PM – 06:00 AM (Overnight / Next Day)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Shift Completion:</span>
                    <span className="font-semibold text-amber-600">Interactive Prompt Dialog ("End Shift" / "Overtime")</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Auto-Tracking Stop:</span>
                    <span className="font-medium text-emerald-600">Disabled (Continuous tracking for overtime & calls)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Desktop Check-In Mode:</span>
                    <span className="font-semibold text-indigo-600">Work Email Startup Dialog (Popup)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Idle Alert Threshold:</span>
                    <span className="font-medium text-slate-800">5 Minutes without input</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Tamper / Disconnect Alert:</span>
                    <span className="font-medium text-slate-800">15 Minutes without ping</span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-500 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>When shift ends, a popup asks the employee if they want to check out or continue overtime work.</span>
                </div>
              </div>

              {/* Card 3: Desktop Client Deployment */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                    <Laptop className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Desktop Client Deployment</h2>
                    <p className="text-xs text-slate-500">Windows agent installer for employee PCs</p>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Installer Package:</span>
                    <span className="font-semibold text-slate-800">EmployeeTrackerSetup.exe (v1.4.0)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Target Operating System:</span>
                    <span className="font-medium text-slate-800">Windows 10 / Windows 11 (64-bit)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Backend API URL:</span>
                    <span className="font-mono text-emerald-700">http://localhost:8000 (Operational)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Auto-Start on Boot:</span>
                    <span className="font-medium text-emerald-600">Configured via Inno Setup Registry</span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-500 flex items-center gap-2">
                  <Download className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span>Compiled installer located in desktop_client/Output/EmployeeTrackerSetup.exe</span>
                </div>
              </div>

              {/* Card 4: Database & Privacy Compliance */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Database & Privacy Compliance</h2>
                    <p className="text-xs text-slate-500">Query optimization & privacy policy</p>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Database Indexing:</span>
                    <span className="font-semibold text-emerald-600">
                      Active (name, role, activity, presence)
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Realtime Sync Cycle:</span>
                    <span className="font-semibold text-slate-800">30s polling + WebSocket telemetry</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Screenshots / Audio:</span>
                    <span className="font-semibold text-emerald-600">Strictly Disabled (Zero Capture)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Keystroke Logging:</span>
                    <span className="font-semibold text-emerald-600">Strictly Disabled (Pulse only)</span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500 flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>
                    Strict enterprise compliance policy: only active window title captions and call session intervals are recorded.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
