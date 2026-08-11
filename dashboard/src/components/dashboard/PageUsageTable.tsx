import { AppWindow } from "lucide-react";

interface PageItem {
  app: string;
  title: string;
  secs: number;
}

function formatDuration(secs: number) {
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function PageUsageTable({ breakdown }: { breakdown: PageItem[] }) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <AppWindow className="h-4 w-4 text-indigo-600" />
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Pages and windows used</h3>
          <p className="text-xs text-slate-500">
            Meaningful pages grouped with total time, without screenshots
          </p>
        </div>
      </div>

      {!breakdown?.length ? (
        <p className="text-xs text-slate-400">No page or window activity yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {breakdown.map((item) => (
            <div key={`${item.app}:${item.title}`} className="flex items-center gap-4 py-3">
              <span className="w-28 shrink-0 truncate text-xs font-medium text-indigo-700">
                {item.app}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={item.title}>
                {item.title}
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-900">
                {formatDuration(item.secs)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
