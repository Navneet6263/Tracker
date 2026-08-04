// Offline & Screen Lock timeline panel
interface OfflinePeriod {
  from: string;
  to: string;
  reason: string;
}

function parseUtcDate(dateStr: string | null): Date {
  if (!dateStr) return new Date(0);
  const normalized = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : `${dateStr}Z`;
  return new Date(normalized);
}

function fmtDuration(fromStr: string, toStr: string) {
  const diffMs = parseUtcDate(toStr).getTime() - parseUtcDate(fromStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "< 1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTime(isoStr: string) {
  return parseUtcDate(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props { periods: OfflinePeriod[]; totalIdleMins?: number }

export function OfflineTimeline({ periods, totalIdleMins }: Props) {
  if (!periods || periods.length === 0) return null;

  const calculatedMins = totalIdleMins ?? periods.reduce((sum, p) => {
    const diff = new Date(p.to).getTime() - new Date(p.from).getTime();
    return sum + Math.max(0, Math.round(diff / 60000));
  }, 0);

  const formattedTotal = calculatedMins < 60 ? `${calculatedMins}m` : `${Math.floor(calculatedMins / 60)}h ${Math.round(calculatedMins % 60)}m`;

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Offline / Locked Periods</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Times when laptop was closed or screen was locked
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 px-3 py-1.5 ring-1 ring-amber-200/70 text-right">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 block">Total Idle Gap</span>
          <span className="text-xs font-bold text-amber-900">{formattedTotal}</span>
        </div>
      </div>
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
                  <p className="text-xs font-semibold text-slate-900">
                    {isLocked ? "Win+L Screen Locked" : "System Offline"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Locked at <span className="font-medium text-slate-700">{fmtTime(p.from)}</span> → Unlocked at <span className="font-medium text-slate-700">{fmtTime(p.to)}</span>
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
                  {fmtDuration(p.from, p.to)} Locked
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
