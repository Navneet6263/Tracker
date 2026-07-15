import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Mail, Clock, Gauge } from "lucide-react";
import { employees, screenshots, weeklyActivity } from "@/data/mockData";
import {
  getPingStatus,
  getLiveInput,
  formatPing,
} from "@/hooks/useEmployeeStatus";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatusPing } from "@/components/dashboard/StatusPing";
import { ActivityIndicators } from "@/components/dashboard/ActivityIndicators";
import { ScreenshotGrid } from "@/components/dashboard/ScreenshotGrid";
import { ActivityChart } from "@/components/dashboard/ActivityChart";

export const Route = createFileRoute("/employees/$id")({
  loader: ({ params }) => {
    const employee = employees.find((e) => e.id === params.id);
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
  const { employee } = Route.useLoaderData();
  const status = getPingStatus(employee.active_hours, employee.last_ping);
  const shots = screenshots.filter((s) => s.employee_id === employee.id);
  const chart = weeklyActivity(employee.id);
  const input = getLiveInput(employee.id);

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to overview
        </Link>

        <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-semibold text-white shadow-lg shadow-indigo-500/20">
                {employee.avatar}
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                  {employee.name}
                </h1>
                <p className="text-sm text-slate-500">{employee.role}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <Mail className="h-3 w-3" /> {employee.email}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusPing status={status} label={formatPing(employee.last_ping)} />
              <ActivityIndicators input={input} />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MiniStat icon={Gauge} label="Productivity" value={`${employee.productivity_score}%`} />
            <MiniStat icon={Clock} label="Active Today" value={`${employee.active_hours.toFixed(1)}h`} />
            <MiniStat icon={Clock} label="Screenshots" value={shots.length} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ActivityChart data={chart} />
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-900">Session Notes</h3>
            <p className="mt-2 text-xs text-slate-500">
              Signals summarized from the last 24 hours of activity.
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <NoteItem tone="ok" text={`${employee.name.split(" ")[0]} logged in on time.`} />
              <NoteItem tone="warn" text="Two long idle windows around 2:15 PM." />
              <NoteItem tone={input?.win_r_count ? "bad" : "ok"} text={input?.win_r_count ? `Win+R triggered ${input.win_r_count}× — review.` : "No suspicious shortcuts."} />
            </ul>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent Screenshots</h2>
            <span className="text-xs text-slate-500">Auto-captured every 10 minutes</span>
          </div>
          <ScreenshotGrid screenshots={shots} />
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

function NoteItem({ tone, text }: { tone: "ok" | "warn" | "bad"; text: string }) {
  const color =
    tone === "ok"
      ? "bg-emerald-500"
      : tone === "warn"
      ? "bg-amber-500"
      : "bg-rose-500";
  return (
    <li className="flex items-start gap-2 text-slate-700">
      <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${color}`} />
      <span>{text}</span>
    </li>
  );
}
