import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock, Gauge, Headphones, LogOut, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { ChangePasswordDialog } from "@/components/dashboard/ChangePasswordDialog";
import { EmployeeTable } from "@/components/dashboard/EmployeeTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { TimeSavingsBanner } from "@/components/dashboard/TimeSavingsBanner";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getPingStatus, useLiveSignals, useSummary } from "@/hooks/useRealData";
import { AuthGuard } from "@/lib/auth-guard";
import { getMe, logout } from "@/lib/api";

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

function DashboardContent() {
  const navigate = useNavigate();
  const { data: employees, loading, error } = useSummary();
  const [adminId, setAdminId] = useState<number | null>(null);
  const liveSignals = useLiveSignals(adminId);

  useEffect(() => {
    getMe()
      .then((me) => setAdminId(me.id))
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

  if (loading) {
    return (
      <DashboardShell>
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
      <DashboardShell>
        <div className="flex h-64 items-center justify-center text-sm text-rose-500">
          Cannot reach the activity service: {error}
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-indigo-600">
              Admin overview
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Workforce Dashboard
            </h1>
            <p className="text-sm text-slate-500">
              App, call, shift, input and lock metadata. No screenshots or audio recording.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ChangePasswordDialog />
            <button
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-rose-600"
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

        <EmployeeTable employees={employees} liveSignals={liveSignals} />
      </div>
    </DashboardShell>
  );
}
