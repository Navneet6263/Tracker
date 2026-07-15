import { createFileRoute } from "@tanstack/react-router";
import { Users, Gauge, Clock, ShieldAlert } from "lucide-react";
import { employees } from "@/data/mockData";
import { useDashboardStats } from "@/hooks/useEmployeeStatus";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { EmployeeTable } from "@/components/dashboard/EmployeeTable";
import { TimeSavingsBanner } from "@/components/dashboard/TimeSavingsBanner";

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
  const stats = useDashboardStats();
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

        <AlertBanner tamperCount={stats.tamperCount} runAlerts={stats.runAlerts} />

        <TimeSavingsBanner />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active Employees"
            value={`${stats.active}/${stats.total}`}
            hint="Signals within last 5 min"
            icon={Users}
            tone="success"
          />
          <StatCard
            label="Avg Productivity"
            value={`${stats.avgScore}%`}
            hint="Across all monitored users"
            icon={Gauge}
          />
          <StatCard
            label="Total Hours Today"
            value={`${stats.totalHours}h`}
            hint="Sum of tracked active time"
            icon={Clock}
          />
          <StatCard
            label="Anomaly Signals"
            value={stats.tamperCount + stats.runAlerts}
            hint={`${stats.tamperCount} tamper · ${stats.runAlerts} Win+R`}
            icon={ShieldAlert}
            tone={stats.tamperCount + stats.runAlerts > 0 ? "danger" : "default"}
          />
        </div>

        <EmployeeTable employees={employees} />
      </div>
    </DashboardShell>
  );
}
