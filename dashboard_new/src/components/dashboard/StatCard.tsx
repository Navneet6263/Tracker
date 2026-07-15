import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
}

const toneStyles: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  success: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  warning: "bg-amber-50 text-amber-600 ring-amber-100",
  danger: "bg-rose-50 text-rose-600 ring-rose-100",
};

export function StatCard({ label, value, hint, icon: Icon, tone = "default" }: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:shadow-[0_10px_30px_-12px_rgba(15,23,42,0.15)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        <div className={`grid h-11 w-11 place-items-center rounded-xl ring-1 ${toneStyles[tone]}`}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
      </div>
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-slate-50 to-transparent opacity-70" />
    </div>
  );
}
