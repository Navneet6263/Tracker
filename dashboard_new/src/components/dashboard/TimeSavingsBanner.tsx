import { TrendingDown, Clock4 } from "lucide-react";
import { employees, appUsage } from "@/data/mockData";

// Calculates total distraction minutes across all employees
function getTotalDistractionMins(): number {
  return employees.reduce((total, emp) => {
    const usage = appUsage[emp.id] ?? [];
    return total + usage
      .filter((u) => u.category === "distraction")
      .reduce((a, u) => a + u.minutes, 0);
  }, 0);
}

export function TimeSavingsBanner() {
  const distractionMins = getTotalDistractionMins();
  const distractionHours = (distractionMins / 60).toFixed(1);
  const potentialSavingHours = (distractionMins * 0.7 / 60).toFixed(1); // 70% recoverable

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-indigo-600">
          <TrendingDown className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-indigo-900">
            Your team wasted <span className="text-rose-600">{distractionHours}h</span> on distractions today
          </p>
          <p className="text-xs text-indigo-600/80">
            YouTube, Instagram, Netflix and personal apps detected
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow-sm ring-1 ring-indigo-100">
        <Clock4 className="h-4 w-4 text-emerald-600" />
        <div>
          <p className="text-xs text-slate-500">You could save</p>
          <p className="text-lg font-bold text-emerald-700 leading-tight">{potentialSavingHours}h / day</p>
        </div>
      </div>
    </div>
  );
}
