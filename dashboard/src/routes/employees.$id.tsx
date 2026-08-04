import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Mail, Clock, Gauge, RefreshCw, Keyboard, Mouse, Terminal } from "lucide-react";
import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatusPing } from "@/components/dashboard/StatusPing";
import { ScreenshotGrid } from "@/components/dashboard/ScreenshotGrid";
import { OnDemandScreenshot } from "@/components/dashboard/OnDemandScreenshot";
import { AppUsageDetail } from "@/components/dashboard/AppUsageDetail";
import { OfflineTimeline } from "@/components/dashboard/OfflineTimeline";
import { useEmployeeDetail, getPingStatus, formatPing } from "@/hooks/useRealData";
import { fetchSummary, type EmployeeSummary } from "@/lib/api";
import { AuthGuard } from "@/lib/auth-guard";

export const Route = createFileRoute("/employees/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Employee #${params.id} · Sentinel` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmployeeDetailPage,
});

function EmployeeDetailPage() {
  return (
    <AuthGuard>
      <EmployeeDetailContent />
    </AuthGuard>
  );
}

function EmployeeDetailContent() {
  const { id } = Route.useParams();
  const employeeId = Number(id);
  
  const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
  const [empLoading, setEmpLoading] = useState(true);
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  
  const { analytics, screenshots, loading: detailLoading } = useEmployeeDetail(employeeId, period);
  const [shots, setShots] = useState(screenshots);

  useEffect(() => {
    fetchSummary()
      .then((all) => {
        const emp = all.find((e) => e.id === employeeId);
        setEmployee(emp || null);
      })
      .catch(() => {})
      .finally(() => setEmpLoading(false));
  }, [employeeId]);

  useEffect(() => {
    setShots(screenshots);
  }, [screenshots]);

  if (empLoading || detailLoading) {
    return (
      <DashboardShell>
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          Loading employee details…
        </div>
      </DashboardShell>
    );
  }

  if (!employee) {
    return (
      <DashboardShell>
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-slate-500">Employee not found or unauthorized.</p>
          <a href="/" className="text-xs font-medium text-indigo-600 hover:underline">
            Back to Dashboard
          </a>
        </div>
      </DashboardShell>
    );
  }

  const status = getPingStatus(employee.active_hours, employee.last_ping);
  const initials = employee.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const formattedShots = shots.map((s) => ({
    id: String(s.id),
    employee_id: String(employee.id),
    url: s.url,
    window_title: s.window_title || "Unknown",
    timestamp: s.captured_at,
  }));

  const kbMins = analytics?.keyboard_mins ?? 0;
  const mouseMins = analytics?.mouse_mins ?? 0;
  const breakdown = analytics?.app_breakdown ?? [];
  const offlinePeriods = analytics?.offline_periods ?? [];

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Back Link */}
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </a>

        {/* Profile Card */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 font-bold text-white shadow-md">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                    {employee.name}
                  </h1>
                  <StatusPing status={status} />
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {employee.email}
                  </span>
                  <span>·</span>
                  <span className="capitalize">{status}</span>
                  <span>·</span>
                  <span>{formatPing(employee.last_ping)}</span>
                </div>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <MiniStat icon={Gauge} label="Productivity" value={`${employee.productivity_score}%`} />
              <MiniStat icon={Clock} label="Active Today" value={`${employee.active_hours.toFixed(1)}h`} />
              <MiniStat icon={Keyboard} label="Typing" value={`${kbMins}m`} />
              <MiniStat icon={Mouse} label="Mouse Active" value={`${mouseMins}m`} />
              <MiniStat icon={Terminal} label="Win+R Launches" value={`${analytics?.win_r_count ?? 0}`} />
            </div>
          </div>
        </div>

        {/* Period Toggle */}
        <div className="flex items-center gap-2">
          {(["day", "week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                period === p
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {p}
            </button>
          ))}
          {detailLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>

        {/* App Usage Breakdown */}
        <AppUsageDetail
          breakdown={breakdown}
          keyboardMins={kbMins}
          mouseMins={mouseMins}
        />

        {/* Offline / Locked Timeline */}
        <OfflineTimeline periods={offlinePeriods} totalIdleMins={analytics?.total_idle_mins} />

        {/* On-Demand Screenshot */}
        <OnDemandScreenshot employeeId={String(employee.id)} employeeName={employee.name} />

        {/* Recent Screenshots from real API */}
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent Screenshots</h2>
            <span className="text-xs text-slate-500">Auto-captured every 15 minutes</span>
          </div>
          {formattedShots.length === 0 && !detailLoading ? (
            <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400">
              No screenshots yet for this employee.
            </div>
          ) : (
            <ScreenshotGrid
              screenshots={formattedShots}
              onDelete={(deletedId) => setShots((prev) => prev.filter((s) => String(s.id) !== deletedId))}
            />
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}
