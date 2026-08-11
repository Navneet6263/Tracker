import type { PingStatus } from "@/hooks/useRealData";

interface Props {
  status: PingStatus;
  label?: string;
}

const STYLE: Record<PingStatus, { text: string; classes: string; dot: string }> = {
  active: {
    text: "Active",
    classes: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
  },
  meeting: {
    text: "Client call",
    classes: "bg-violet-50 text-violet-700 ring-violet-200",
    dot: "bg-violet-500",
  },
  passive: {
    text: "Passive work",
    classes: "bg-blue-50 text-blue-700 ring-blue-200",
    dot: "bg-blue-500",
  },
  idle: {
    text: "Idle",
    classes: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500",
  },
  locked: {
    text: "Locked",
    classes: "bg-slate-100 text-slate-700 ring-slate-200",
    dot: "bg-slate-500",
  },
  off_shift: {
    text: "Off shift",
    classes: "bg-slate-50 text-slate-500 ring-slate-200",
    dot: "bg-slate-400",
  },
  offline: {
    text: "Offline",
    classes: "bg-slate-50 text-slate-600 ring-slate-200",
    dot: "bg-slate-400",
  },
  tamper: {
    text: "Agent missing",
    classes: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-600",
  },
};

export function StatusPing({ status, label }: Props) {
  const style = STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${style.classes}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.text}
      {label ? ` · ${label}` : ""}
    </span>
  );
}
