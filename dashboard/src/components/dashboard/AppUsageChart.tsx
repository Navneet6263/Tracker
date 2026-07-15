import { appUsage } from "@/data/mockData";

const CATEGORY_COLOR: Record<string, string> = {
  productive: "bg-emerald-500",
  neutral: "bg-amber-400",
  distraction: "bg-rose-500",
};
const CATEGORY_LABEL: Record<string, string> = {
  productive: "Productive",
  neutral: "Neutral",
  distraction: "Distraction",
};

interface Props { employeeId: string }

export function AppUsageChart({ employeeId }: Props) {
  const entries = appUsage[employeeId] ?? [];
  const total = entries.reduce((a, e) => a + e.minutes, 0) || 1;

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">App Usage Today</h3>
        <span className="text-xs text-slate-400">{Math.round(total / 60 * 10) / 10}h tracked</span>
      </div>

      {/* Stacked bar */}
      <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {entries.map((e) => (
          <div
            key={e.app}
            title={`${e.app}: ${e.minutes}m`}
            className={`h-full transition-all ${CATEGORY_COLOR[e.category]}`}
            style={{ width: `${(e.minutes / total) * 100}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <ul className="space-y-2">
        {entries.map((e) => (
          <li key={e.app} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-slate-700">
              <span className={`h-2 w-2 rounded-full ${CATEGORY_COLOR[e.category]}`} />
              {e.app}
              <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${
                e.category === "productive" ? "bg-emerald-50 text-emerald-700" :
                e.category === "neutral"    ? "bg-amber-50 text-amber-700" :
                                             "bg-rose-50 text-rose-700"
              }`}>{CATEGORY_LABEL[e.category]}</span>
            </span>
            <span className="tabular-nums text-slate-500">{e.minutes}m</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
