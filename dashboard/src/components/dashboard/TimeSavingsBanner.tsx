import { TrendingDown, Clock4, CheckCircle2 } from "lucide-react";
import type { EmployeeSummary } from "@/lib/api";

interface Props { employees: EmployeeSummary[] }

export function TimeSavingsBanner({ employees }: Props) {
  const totalActiveHours = employees.reduce((a, e) => a + e.active_hours, 0);
  const avgProductivity = employees.length
    ? employees.reduce((a, e) => a + e.productivity_score, 0) / employees.length / 100
    : 1;

  const distractionHours = Math.max(0, Number((totalActiveHours * (1 - avgProductivity)).toFixed(1)));
  const potentialSavingHours = Math.max(0, Number((totalActiveHours * (1 - avgProductivity) * 0.7).toFixed(1)));

  if (totalActiveHours === 0 || distractionHours === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-3 text-sm text-indigo-900">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        <div>
          <p className="font-semibold text-slate-900">High Productivity Today</p>
          <p className="text-xs text-slate-500">All active workstations are operating at optimal focus.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-indigo-600">
          <TrendingDown className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-indigo-900">
            Unfocused Time Detected: <span className="text-rose-600">{distractionHours}h</span> today
          </p>
          <p className="text-xs text-indigo-600/80">
            Calculated from real-time activity and application focus tracking
          </p>
        </div>
      </div>
      {potentialSavingHours > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow-sm ring-1 ring-indigo-100">
          <Clock4 className="h-4 w-4 text-emerald-600" />
          <div>
            <p className="text-xs text-slate-500">Potential Focus Gain</p>
            <p className="text-lg font-bold text-emerald-700 leading-tight">+{potentialSavingHours}h / day</p>
          </div>
        </div>
      )}
    </div>
  );
}
