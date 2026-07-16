// Offline & Screen Lock timeline panel
interface OfflinePeriod {
  from: string;
  to: string;
  reason: string;
}

function fmtDuration(fromStr: string, toStr: string) {
  const diffMs = new Date(toStr).getTime() - new Date(fromStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTime(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props { periods: OfflinePeriod[] }

export function OfflineTimeline({ periods }: Props) {
  if (!periods || periods.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Offline / Locked Periods</h3>
      <p className="text-xs text-slate-500 mb-4">
        Times when laptop was closed or screen was locked
      </p>
      <div className="space-y-2">
        {periods.map((p, i) => {
          const isLocked = p.reason === "screen_locked";
          return (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <span className={`text-base ${isLocked ? "text-amber-500" : "text-rose-500"}`}>
                  {isLocked ? "🔒" : "📴"}
                </span>
                <div>
                  <p className="text-xs font-medium text-slate-800">
                    {isLocked ? "Screen Locked" : "Went Offline"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {fmtTime(p.from)} → {fmtTime(p.to)}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                {fmtDuration(p.from, p.to)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
