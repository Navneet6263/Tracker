import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Mail, Clock, Gauge, RefreshCw, Keyboard, Mouse } from "lucide-react";
import { useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatusPing } from "@/components/dashboard/StatusPing";
import { ScreenshotGrid } from "@/components/dashboard/ScreenshotGrid";
import { OnDemandScreenshot } from "@/components/dashboard/OnDemandScreenshot";
import { AppUsageDetail } from "@/components/dashboard/AppUsageDetail";
import { OfflineTimeline } from "@/components/dashboard/OfflineTimeline";
import { useEmployeeDetail, getPingStatus, formatPing } from "@/hooks/useRealData";
import { fetchSummary, type EmployeeSummary } from "@/lib/api";

export const Route = createFileRoute("/employees/$id")({
  loader: async ({ params }) => {
    // Load employee summary from real API
    const allEmployees = await fetchSummary();
    const employee = allEmployees.find((e) => String(e.id) === params.id);
    if (!employee) throw notFound();
    return { employee };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.employee.name} · Sentinel`
          : "Employee · Sentinel",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmployeeDetail,
});

function EmployeeDetail() {
  const { employee } = Route.useLoaderData() as { employee: EmployeeSummary };
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const { analytics, screenshots, loading } = useEmployeeDetail(employee.id, period);
  const status = getPingStatus(employee.active_hours, employee.last_ping);

  const initials = employee.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const shots = screenshots.map((s) => ({
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
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to overview
        </Link>

        {/* Employee Header Card */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-semibold text-white shadow-lg shadow-indigo-500/20">
                {initials}
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                  {employee.name}
                </h1>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <Mail className="h-3 w-3" /> {employee.email}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusPing status={status} label={formatPing(employee.last_ping)} />
              <ActivityIndicators input={undefined} />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MiniStat icon={Gauge} label="Productivity" value={`${analytics?.productivity_score ?? employee.productivity_score}%`} />
            <MiniStat icon={Clock} label="Active Today" value={`${(analytics?.active_hours ?? employee.active_hours).toFixed(1)}h`} />
            <MiniStat icon={Keyboard} label="Typing" value={`${Math.round(kbMins)}m`} />
            <MiniStat icon={Mouse} label="Mouse Active" value={`${Math.round(mouseMins)}m`} />
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
          {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>

        {/* App Usage Breakdown */}
        <AppUsageDetail
          breakdown={breakdown}
          keyboardMins={kbMins}
          mouseMins={mouseMins}
        />

        {/* Offline / Locked Timeline */}
        <OfflineTimeline periods={offlinePeriods} />

        {/* On-Demand Screenshot */}
        <OnDemandScreenshot employeeId={String(employee.id)} employeeName={employee.name} />

        {/* Recent Screenshots from real API */}
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent Screenshots</h2>
            <span className="text-xs text-slate-500">Auto-captured every 15 minutes</span>
          </div>
          {shots.length === 0 && !loading ? (
            <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400">
              No screenshots yet for this employee.
            </div>
          ) : (
            <ScreenshotGrid screenshots={shots} />
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
