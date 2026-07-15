// AppUsageChart now accepts real data from the analytics API
// app_breakdown comes from: GET /analytics/employee/{id}

const CATEGORY_COLOR = (secs: number, total: number) => {
  const pct = secs / total;
  if (pct > 0.3) return "bg-emerald-500";
  if (pct > 0.1) return "bg-amber-400";
  return "bg-rose-500";
};

interface AppEntry { app: string; secs: number }
interface Props { breakdown: AppEntry[] }

export function AppUsageChart({ breakdown }: Props) {
  const total = breakdown.reduce((a, e) => a + e.secs, 0) || 1;

  if (breakdown.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">App Usage Today</h3>
        <p className="text-xs text-slate-400">No app usage data yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">App Usage Today</h3>
        <span className="text-xs text-slate-400">{(total / 3600).toFixed(1)}h tracked</span>
      </div>

      {/* Stacked bar */}
      <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {breakdown.map((e) => (
          <div
            key={e.app}
            title={`${e.app}: ${Math.round(e.secs / 60)}m`}
            className={`h-full transition-all ${CATEGORY_COLOR(e.secs, total)}`}
            style={{ width: `${(e.secs / total) * 100}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <ul className="space-y-2">
        {breakdown.map((e) => (
          <li key={e.app} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-slate-700">
              <span className={`h-2 w-2 rounded-full ${CATEGORY_COLOR(e.secs, total)}`} />
              {e.app}
            </span>
            <span className="tabular-nums text-slate-500">{Math.round(e.secs / 60)}m</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
