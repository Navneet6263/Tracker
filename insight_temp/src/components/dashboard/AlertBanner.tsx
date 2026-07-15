import { ShieldAlert } from "lucide-react";

interface Props {
  tamperCount: number;
  runAlerts: number;
}

export function AlertBanner({ tamperCount, runAlerts }: Props) {
  const total = tamperCount + runAlerts;
  if (total === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-5 py-3 text-sm text-emerald-800">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-emerald-600 ring-1 ring-emerald-200">
          ✓
        </span>
        All monitored workstations are behaving normally.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 to-white px-5 py-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-rose-100 text-rose-600">
          <ShieldAlert className="h-4 w-4" />
        </span>
        <div>
          <p className="font-semibold text-rose-900">{total} anomaly signals detected</p>
          <p className="text-xs text-rose-700/80">
            {tamperCount} possible tamper · {runAlerts} Win+R launches this hour
          </p>
        </div>
      </div>
      <button className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-rose-700">
        Review incidents
      </button>
    </div>
  );
}
