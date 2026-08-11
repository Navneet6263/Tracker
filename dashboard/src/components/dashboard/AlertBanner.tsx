import { ShieldAlert } from "lucide-react";

export function AlertBanner({ anomalyCount }: { anomalyCount: number }) {
  if (anomalyCount === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-5 py-3 text-sm text-emerald-800">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-emerald-600 ring-1 ring-emerald-200">
          ✓
        </span>
        All assigned trackers are reporting normally.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-rose-100 text-rose-600">
        <ShieldAlert className="h-4 w-4" />
      </span>
      <div>
        <p className="font-semibold text-rose-900">{anomalyCount} tracker signals are missing</p>
        <p className="text-xs text-rose-700/80">
          Review devices that stopped reporting during an active shift.
        </p>
      </div>
    </div>
  );
}
