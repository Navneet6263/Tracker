import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Gauge,
  Globe,
  Headphones,
  Keyboard,
  Laptop,
  Loader2,
  Lock,
  Mail,
  Mouse,
  Printer,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppUsageDetail } from "@/components/dashboard/AppUsageDetail";
import { DailyBreakdownTable } from "@/components/dashboard/DailyBreakdownTable";
import { HourlyActivityTimeline } from "@/components/dashboard/HourlyActivityTimeline";
import { OfflineTimeline } from "@/components/dashboard/OfflineTimeline";
import { PageUsageTable } from "@/components/dashboard/PageUsageTable";
import { StatusPing } from "@/components/dashboard/StatusPing";
import { WorkSessionHistory } from "@/components/dashboard/WorkSessionHistory";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatPing, getPingStatus, useEmployeeDetail } from "@/hooks/useRealData";
import { AuthGuard } from "@/lib/auth-guard";
import { fetchSummary, deleteEmployee, type EmployeeSummary, type AnalyticsQueryOptions } from "@/lib/api";

export const Route = createFileRoute("/employees/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Employee #${params.id} · Sentinel` }, { name: "robots", content: "noindex" }],
  }),
  component: EmployeeDetailPage,
});

function getTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const nextY = dt.getFullYear();
  const nextM = String(dt.getMonth() + 1).padStart(2, "0");
  const nextD = String(dt.getDate()).padStart(2, "0");
  return `${nextY}-${nextM}-${nextD}`;
}

function formatDisplayDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

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

  // Date filtering state
  const todayStr = useMemo(() => getTodayStr(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [activeTab, setActiveTab] = useState<"overview" | "apps" | "pages" | "sessions">("overview");

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Formulate query options for real data hook
  const queryOptions: AnalyticsQueryOptions = useMemo(() => {
    if (period === "week") return { period: "week" };
    if (period === "month") return { period: "month" };
    return { date: selectedDate, period: "day" };
  }, [period, selectedDate]);

  const { analytics, loading: detailLoading, error: detailError } = useEmployeeDetail(employeeId, queryOptions);

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await deleteEmployee(employeeId);
      window.location.replace("/");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete employee profile");
      setDeleting(false);
    }
  };

  useEffect(() => {
    fetchSummary()
      .then((all) => setEmployee(all.find((item) => item.id === employeeId) ?? null))
      .catch(() => setEmployee(null))
      .finally(() => setEmployeeLoading(false));
  }, [employeeId]);

  if (employeeLoading) {
    return (
      <DashboardShell>
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-indigo-600" />
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

  const isToday = selectedDate === todayStr && period === "day";

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Navigation & Breadcrumbs */}
        <div className="flex items-center justify-between">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </a>

          {/* Quick status pill */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Live Status:</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700 capitalize">
              <StatusPing status={status} />
              {employee.current_state || status}
              {employee.current_app && (
                <span className="font-semibold text-indigo-700">· {employee.current_app}</span>
              )}
            </span>
          </div>
        </div>

        {/* Employee Header Profile Card */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 font-bold text-white shadow-xs text-lg">
                {initials}
                <div className="absolute -bottom-1 -right-1">
                  <StatusPing status={status} />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">
                    {employee.name}
                  </h1>
                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                    Employee #{employee.id}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1 text-slate-700 font-medium">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    {employee.identity_mode === "work_account" ? "Verified Work Account" : employee.email}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Laptop className="h-3.5 w-3.5 text-slate-400" />
                    {employee.current_device || "Active PC Profile"}
                  </span>
                  <span>·</span>
                  <span>Seen {formatPing(employee.last_ping)}</span>
                  {employee.shift && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                        <Clock className="h-3 w-3 text-slate-500" />
                        {employee.shift.name} ({employee.shift.start}–{employee.shift.end})
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 cursor-pointer"
                title="Print or Save as PDF Report"
              >
                <Printer className="h-3.5 w-3.5 text-slate-500" /> Export PDF / Print
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteDialog(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-xs transition hover:bg-rose-50 hover:border-rose-300 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Profile
              </button>
            </div>

          </div>
        </div>

        {/* Date Filter & Period Control Bar */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Quick Period Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(todayStr);
                  setPeriod("day");
                }}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  isToday
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                }`}
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedDate(shiftDate(todayStr, -1));
                  setPeriod("day");
                }}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  period === "day" && selectedDate === shiftDate(todayStr, -1)
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                }`}
              >
                Yesterday
              </button>

              <button
                type="button"
                onClick={() => setPeriod("week")}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  period === "week"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                }`}
              >
                Last 7 Days (Week)
              </button>

              <button
                type="button"
                onClick={() => setPeriod("month")}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  period === "month"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                }`}
              >
                Last 30 Days (Month)
              </button>
            </div>

            {/* Date-Picker & Day Step Controls */}
            <div className="flex items-center gap-2">
              {period === "day" && (
                <div className="flex items-center rounded-xl bg-slate-50 p-0.5 ring-1 ring-slate-200">
                  <button
                    type="button"
                    title="Previous Day"
                    onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
                    className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 transition"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-1 px-2 text-xs font-semibold text-slate-800">
                    <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                    <span>{formatDisplayDate(selectedDate)}</span>
                  </div>

                  <button
                    type="button"
                    title="Next Day"
                    onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
                    className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 transition"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Native Calendar Picker Input */}
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  max={todayStr}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setPeriod("day");
                    }
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
                />
              </div>

              {detailLoading && <RefreshCw className="h-4 w-4 animate-spin text-indigo-600 ml-1" />}
            </div>
          </div>
        </div>

        {/* Analytics Display */}
        {detailLoading && !analytics ? (
          <div className="flex h-48 items-center justify-center rounded-2xl bg-white text-xs text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
            Loading analytics for selected date…
          </div>
        ) : !analytics ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
            No analytics data available for this employee.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Executive Metric Cards Ribbon */}
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
              {/* Card 1: Verified Active Work */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium">Active Work</span>
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="text-xl font-bold tracking-tight text-slate-900">
                  {analytics.active_hours.toFixed(1)}h
                </div>
                <p className="text-[11px] text-slate-400">
                  {Math.round((analytics.active_hours / 8) * 100)}% of 8h standard shift
                </p>
              </div>

              {/* Card 2: Productivity Score */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium">Productivity</span>
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Gauge className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="text-xl font-bold tracking-tight text-slate-900">
                  {analytics.productivity_score}%
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  <span
                    className={`font-semibold ${
                      analytics.productivity_score >= 80
                        ? "text-emerald-600"
                        : analytics.productivity_score >= 60
                        ? "text-amber-600"
                        : "text-rose-600"
                    }`}
                  >
                    {analytics.productivity_score >= 80
                      ? "Optimal"
                      : analytics.productivity_score >= 60
                      ? "Moderate"
                      : "Low Output"}
                  </span>
                </div>
              </div>

              {/* Card 3: Input Activity Pulse */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium">Input Events</span>
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-violet-50 text-violet-600">
                    <Zap className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="text-xl font-bold tracking-tight text-slate-900">
                  {((analytics.keyboard_events || 0) + (analytics.mouse_events || 0)).toLocaleString()}
                </div>
                <p className="text-[11px] text-slate-400">
                  {analytics.keyboard_events || 0} keys · {analytics.mouse_events || 0} clicks
                </p>
              </div>

              {/* Card 4: VoIP / Client Calls */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium">VoIP Calls</span>
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-purple-50 text-purple-600">
                    <Headphones className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="text-xl font-bold tracking-tight text-slate-900">
                  {analytics.meeting_mins}m
                </div>
                <p className="text-[11px] text-slate-400">Teams / Zoom / Meet</p>
              </div>

              {/* Card 5: Idle & Away Time */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium">Idle / Away</span>
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-amber-50 text-amber-600">
                    <Coffee className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="text-xl font-bold tracking-tight text-slate-900">
                  {analytics.idle_mins}m
                </div>
                <p className="text-[11px] text-slate-400">Inactive past threshold</p>
              </div>

              {/* Card 6: Screen Locked */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium">Screen Locked</span>
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    <Lock className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="text-xl font-bold tracking-tight text-slate-900">
                  {analytics.locked_mins}m
                </div>
                <p className="text-[11px] text-slate-400">Windows lock screen</p>
              </div>
            </div>

            {/* Navigation Tabs Bar */}
            <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  activeTab === "overview"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                📊 Overview & Timeline
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("apps")}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  activeTab === "apps"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                💻 App Usage ({analytics.app_breakdown?.length || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("pages")}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  activeTab === "pages"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                🌐 Window Titles & Pages ({analytics.page_breakdown?.length || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("sessions")}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  activeTab === "sessions"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                🛡️ Audit & Sessions ({analytics.work_sessions?.length || 0})
              </button>
            </div>

            {/* Tab 1: Overview & Timeline */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Hourly Timeline */}
                <HourlyActivityTimeline
                  timeline={analytics.hourly_timeline}
                  selectedDate={analytics.selected_date || selectedDate}
                />

                {/* State Distribution Multi-segment Progress Bar */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Work State Distribution</h3>
                    <span className="text-xs text-slate-400">Total duration breakdown</span>
                  </div>

                  {(() => {
                    const activeM = (analytics.state_breakdown?.active || 0);
                    const meetM = (analytics.state_breakdown?.meeting || 0);
                    const passM = (analytics.state_breakdown?.passive || 0);
                    const idleM = (analytics.state_breakdown?.idle || 0);
                    const lockM = (analytics.state_breakdown?.locked || 0);
                    const totalM = activeM + meetM + passM + idleM + lockM || 1;

                    return (
                      <div className="space-y-2">
                        <div className="h-4 w-full rounded-full bg-slate-100 overflow-hidden flex ring-1 ring-slate-200/50">
                          {activeM > 0 && (
                            <div
                              style={{ width: `${(activeM / totalM) * 100}%` }}
                              className="bg-emerald-500 h-full transition-all"
                              title={`Active: ${activeM}m`}
                            />
                          )}
                          {meetM > 0 && (
                            <div
                              style={{ width: `${(meetM / totalM) * 100}%` }}
                              className="bg-purple-500 h-full transition-all"
                              title={`VoIP Calls: ${meetM}m`}
                            />
                          )}
                          {passM > 0 && (
                            <div
                              style={{ width: `${(passM / totalM) * 100}%` }}
                              className="bg-sky-400 h-full transition-all"
                              title={`Passive Work: ${passM}m`}
                            />
                          )}
                          {idleM > 0 && (
                            <div
                              style={{ width: `${(idleM / totalM) * 100}%` }}
                              className="bg-amber-400 h-full transition-all"
                              title={`Idle / Away: ${idleM}m`}
                            />
                          )}
                          {lockM > 0 && (
                            <div
                              style={{ width: `${(lockM / totalM) * 100}%` }}
                              className="bg-slate-300 h-full transition-all"
                              title={`Locked: ${lockM}m`}
                            />
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 pt-1">
                          <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Active: {activeM}m (
                            {Math.round((activeM / totalM) * 100)}%)
                          </span>
                          <span className="flex items-center gap-1.5 font-medium text-purple-700">
                            <span className="h-2 w-2 rounded-full bg-purple-500" /> Calls: {meetM}m (
                            {Math.round((meetM / totalM) * 100)}%)
                          </span>
                          <span className="flex items-center gap-1.5 font-medium text-sky-700">
                            <span className="h-2 w-2 rounded-full bg-sky-400" /> Passive: {passM}m (
                            {Math.round((passM / totalM) * 100)}%)
                          </span>
                          <span className="flex items-center gap-1.5 font-medium text-amber-700">
                            <span className="h-2 w-2 rounded-full bg-amber-400" /> Idle: {idleM}m (
                            {Math.round((idleM / totalM) * 100)}%)
                          </span>
                          <span className="flex items-center gap-1.5 font-medium text-slate-600">
                            <span className="h-2 w-2 rounded-full bg-slate-300" /> Locked: {lockM}m (
                            {Math.round((lockM / totalM) * 100)}%)
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Daily Attendance Breakdown Table (if multiple days or week/month selected) */}
                {(period === "week" || period === "month" || (analytics.daily_breakdown && analytics.daily_breakdown.length > 1)) && (
                  <DailyBreakdownTable
                    days={analytics.daily_breakdown}
                    currentDate={selectedDate}
                    onSelectDate={(newDate) => {
                      setSelectedDate(newDate);
                      setPeriod("day");
                    }}
                  />
                )}

                {/* Side-by-Side Quick Previews */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <AppUsageDetail
                    breakdown={analytics.app_breakdown}
                    keyboardMins={analytics.keyboard_mins}
                    mouseMins={analytics.mouse_mins}
                  />
                  <PageUsageTable breakdown={analytics.page_breakdown} />
                </div>
              </div>
            )}

            {/* Tab 2: Applications & Tools */}
            {activeTab === "apps" && (
              <AppUsageDetail
                breakdown={analytics.app_breakdown}
                keyboardMins={analytics.keyboard_mins}
                mouseMins={analytics.mouse_mins}
              />
            )}

            {/* Tab 3: Window Titles & Visited Pages */}
            {activeTab === "pages" && (
              <PageUsageTable breakdown={analytics.page_breakdown} />
            )}

            {/* Tab 4: Audit Logs & Work Sessions */}
            {activeTab === "sessions" && (
              <div className="space-y-6">
                {/* Work Session Records */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Work Sessions & Check-Ins</h3>
                      <p className="text-xs text-slate-500">Tracked check-ins, workstation devices, and active hours</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-full ring-1 ring-slate-200">
                      {analytics.work_sessions?.length || 0} Sessions
                    </span>
                  </div>

                  {!analytics.work_sessions?.length ? (
                    <p className="py-4 text-center text-xs text-slate-400">No session intervals recorded for this period.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {analytics.work_sessions.map((sess) => (
                        <div key={sess.session_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{sess.device_name}</span>
                              <span className="font-mono text-[11px] text-slate-400 truncate max-w-[140px]">
                                {sess.session_id}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Started: {new Date(sess.started_at).toLocaleString()}
                              {sess.ended_at && ` · Ended: ${new Date(sess.ended_at).toLocaleTimeString()}`}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-bold text-indigo-700">
                              {sess.active_hours.toFixed(1)}h Active Work
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              {sess.total_events.toLocaleString()} inputs
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Offline & Screen Lock Log */}
                <OfflineTimeline
                  periods={analytics.offline_periods}
                  totalIdleMins={analytics.idle_mins}
                />
              </div>
            )}

            {/* Compliance & Privacy Footer Notice */}
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-xs text-emerald-900 flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
              <span>
                <strong>Privacy Protected:</strong> This report aggregates metadata (active windows, durations,
                input pulses, and VoIP status). Screen screenshots, typed keystroke text, microphone audio, and
                passwords are never collected or transmitted.
              </span>
            </div>
          </div>
        )}

        {/* Delete Employee Confirmation Dialog */}
        <AlertDialog
          open={showDeleteDialog}
          onOpenChange={(open) => {
            if (!open && !deleting) setShowDeleteDialog(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Employee Profile</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-sm text-slate-600">
                Are you sure you want to permanently delete <strong>{employee.name}</strong> ({employee.email})?
                <br /><br />
                This will remove their profile, all tracked activity history, application usage, and shift assignments directly from the database. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  handleDelete();
                }}
                disabled={deleting}
                className="bg-rose-600 text-white hover:bg-rose-700"
              >
                {deleting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Deleting…
                  </>
                ) : (
                  "Delete Profile"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardShell>
  );
}
