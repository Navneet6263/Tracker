// App time breakdown — horizontal bar chart showing hours per app
interface AppItem { app: string; secs: number; hours: number }

const COLORS: Record<string, string> = {
  Gmail: "bg-red-500",
  YouTube: "bg-rose-500",
  WhatsApp: "bg-emerald-500",
  Chrome: "bg-blue-500",
  Edge: "bg-indigo-500",
  Firefox: "bg-orange-500",
  "VS Code": "bg-violet-500",
  "MS Teams": "bg-purple-500",
  Slack: "bg-amber-500",
  Zoom: "bg-sky-500",
  Excel: "bg-green-600",
  Word: "bg-blue-600",
  Outlook: "bg-blue-700",
  Notion: "bg-slate-700",
  Figma: "bg-pink-500",
  Spotify: "bg-emerald-600",
  Netflix: "bg-red-600",
};

function getColor(app: string) {
  return COLORS[app] ?? "bg-indigo-400";
}

function fmtTime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface Props {
  breakdown: AppItem[];
  keyboardMins: number;
  mouseMins: number;
}

export function AppUsageDetail({ breakdown, keyboardMins, mouseMins }: Props) {
  if (!breakdown || breakdown.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">App Usage Breakdown</h3>
        <p className="text-xs text-slate-400">No activity data yet for this period.</p>
      </div>
    );
  }

  const maxSecs = breakdown[0]?.secs ?? 1;

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">App Usage Breakdown</h3>
          <p className="text-xs text-slate-500 mt-0.5">Time spent per app today</p>
        </div>
        {/* Keyboard / Mouse summary */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">
            <span>⌨️</span>
            <span className="font-medium">{Math.round(keyboardMins)}m</span>
            <span className="text-slate-400">active typing</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">
            <span>🖱️</span>
            <span className="font-medium">{Math.round(mouseMins)}m</span>
            <span className="text-slate-400">mouse active</span>
          </div>
        </div>
      </div>

      {/* Bars */}
      <div className="space-y-3">
        {breakdown.map((item) => {
          const pct = Math.max(2, (item.secs / maxSecs) * 100);
          const color = getColor(item.app);
          return (
            <div key={item.app} className="flex items-center gap-3">
              <div className="w-24 shrink-0 truncate text-xs font-medium text-slate-700 text-right">
                {item.app}
              </div>
              <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${color} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-600 font-medium">
                {fmtTime(item.secs)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
