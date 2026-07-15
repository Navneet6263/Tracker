import { createFileRoute } from "@tanstack/react-router";
import { Users, Gauge, Clock, ShieldAlert } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { EmployeeTable } from "@/components/dashboard/EmployeeTable";
import { TimeSavingsBanner } from "@/components/dashboard/TimeSavingsBanner";
import { useSummary, useLiveSignals, getPingStatus } from "@/hooks/useRealData";
import { getMe } from "@/lib/api";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sentinel · Employee Tracking Admin" },
      {
        name: "description",
        content:
          "Live productivity, activity signals and tamper detection for your remote workforce.",
      },
      { property: "og:title", content: "Sentinel · Employee Tracking Admin" },
      {
        property: "og:description",
        content: "Real-time employee monitoring dashboard with productivity insights.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: employees, loading, error } = useSummary();
  const [adminId, setAdminId] = useState<number | null>(null);
  const liveSignals = useLiveSignals(adminId);

  useEffect(() => {
    getMe().then((me) => setAdminId(me.id)).catch(() => {});
  }, []);

  // Compute stats from real data
  const total = employees.length;
  const active = employees.filter((e) => getPingStatus(e.active_hours, e.last_ping) === "active").length;
  const avgScore = total ? Math.round(employees.reduce((a, e) => a + e.productivity_score, 0) / total) : 0;
  const totalHours = employees.reduce((a, e) => a + e.active_hours, 0).toFixed(1);
  const tamperCount = employees.filter((e) => getPingStatus(e.active_hours, e.last_ping) === "tamper").length;
  // Win+R count from live signals
  const runAlerts = Object.values(liveSignals).filter((s) => (s.inputs?.win_r_count ?? 0) > 0).length;

  if (loading) return (
    <DashboardShell>
      <div className="flex h-64 items-center justify-center text-slate-400 text-sm">Loading team data…</div>
    </DashboardShell>
  );

  if (error) return (
    <DashboardShell>
      <div className="flex h-64 items-center justify-center text-rose-500 text-sm">
        ⚠️ Cannot reach backend: {error}<br />
        Make sure your backend is running at <code className="bg-rose-50 px-1 rounded">http://localhost:8000</code>
      </div>
    </DashboardShell>
  );

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-indigo-600">
              Admin Overview
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Good afternoon, Admin
            </h1>
            <p className="text-sm text-slate-500">
              Here's what your team has been up to today.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-slate-500 ring-1 ring-slate-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Live · updated just now
          </div>
        </div>

        <AlertBanner tamperCount={tamperCount} runAlerts={runAlerts} />

        <TimeSavingsBanner employees={employees} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Employees" value={`${active}/${total}`} hint="Signals within last 5 min" icon={Users} tone="success" />
          <StatCard label="Avg Productivity" value={`${avgScore}%`} hint="Across all monitored users" icon={Gauge} />
          <StatCard label="Total Hours Today" value={`${totalHours}h`} hint="Sum of tracked active time" icon={Clock} />
          <StatCard
            label="Anomaly Signals"
            value={tamperCount + runAlerts}
            hint={`${tamperCount} tamper · ${runAlerts} Win+R`}
            icon={ShieldAlert}
            tone={tamperCount + runAlerts > 0 ? "danger" : "default"}
          />
        </div>

        <EmployeeTable employees={employees} liveSignals={liveSignals} />
      </div>
    </DashboardShell>
  );
}
