import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Clock,
  Gauge,
  Headphones,
  Keyboard,
  Lock,
  Mail,
  Mouse,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AppUsageDetail } from "@/components/dashboard/AppUsageDetail";
import { OfflineTimeline } from "@/components/dashboard/OfflineTimeline";
import { PageUsageTable } from "@/components/dashboard/PageUsageTable";
import { StatusPing } from "@/components/dashboard/StatusPing";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { formatPing, getPingStatus, useEmployeeDetail } from "@/hooks/useRealData";
import { AuthGuard } from "@/lib/auth-guard";
import { fetchSummary, type EmployeeSummary } from "@/lib/api";

export const Route = createFileRoute("/employees/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Employee #${params.id} · Sentinel` }, { name: "robots", content: "noindex" }],
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
  const [employeeLoading, setEmployeeLoading] = useState(true);
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const { analytics, loading: detailLoading } = useEmployeeDetail(employeeId, period);

  useEffect(() => {
    fetchSummary()
      .then((all) => setEmployee(all.find((item) => item.id === employeeId) ?? null))
      .catch(() => setEmployee(null))
      .finally(() => setEmployeeLoading(false));
  }, [employeeId]);

  if (employeeLoading || detailLoading) {
    return (
      <DashboardShell>
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          Loading employee details…
        </div>
      </DashboardShell>
    );
  }

  if (!employee || !analytics) {
    return (
      <DashboardShell>
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-slate-500">Employee not found or unauthorized.</p>
          <a href="/" className="text-xs font-medium text-indigo-600 hover:underline">
            Back to dashboard
          </a>
        </div>
      </DashboardShell>
    );
  }

  const status = getPingStatus(employee.active_hours, employee.last_ping, employee.current_state);
  const initials = employee.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </a>

        <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 font-bold text-white">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                    {employee.name}
                  </h1>
                  <StatusPing status={status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {employee.email}
                  </span>
                  <span>·</span>
                  <span>{formatPing(employee.last_ping)}</span>
                  {employee.shift && (
                    <>
                      <span>·</span>
                      <span>
                        {employee.shift.name}: {employee.shift.start}–{employee.shift.end}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(["day", "week", "month"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                period === value
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {value}
            </button>
          ))}
          {detailLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStat
            icon={Clock}
            label="Verified work"
            value={`${analytics.active_hours.toFixed(1)}h`}
          />
          <MiniStat icon={Gauge} label="Productivity" value={`${analytics.productivity_score}%`} />
          <MiniStat icon={Headphones} label="VoIP calls" value={`${analytics.meeting_mins}m`} />
          <MiniStat icon={Lock} label="Locked" value={`${analytics.locked_mins}m`} />
          <MiniStat icon={Keyboard} label="Keyboard active" value={`${analytics.keyboard_mins}m`} />
          <MiniStat icon={Mouse} label="Mouse active" value={`${analytics.mouse_mins}m`} />
          <MiniStat icon={Clock} label="Passive work" value={`${analytics.passive_mins}m`} />
          <MiniStat icon={Clock} label="Idle" value={`${analytics.idle_mins}m`} />
        </div>

        <AppUsageDetail
          breakdown={analytics.app_breakdown}
          keyboardMins={analytics.keyboard_mins}
          mouseMins={analytics.mouse_mins}
        />

        <PageUsageTable breakdown={analytics.page_breakdown} />

        <OfflineTimeline periods={analytics.offline_periods} />

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 text-sm text-emerald-900">
          This report uses application, input, VoIP, idle and Windows session metadata only.
          Screenshots, typed content and call audio are not collected.
        </div>
      </div>
    </DashboardShell>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}
