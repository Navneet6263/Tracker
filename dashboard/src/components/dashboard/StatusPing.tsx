import type { PingStatus } from "@/hooks/useRealData";

interface Props {
  status: PingStatus;
  label: string;
}

export function StatusPing({ status, label }: Props) {
  if (status === "tamper") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-600" />
        </span>
        Tamper · {label}
      </span>
    );
  }
  if (status === "idle") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Idle · {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Active · {label}
    </span>
  );
}
