import { Keyboard, Mouse, AlertTriangle } from "lucide-react";

export interface LiveInput {
  is_keyboard_active: boolean;
  is_mouse_active: boolean;
  win_r_count: number;
}

export function ActivityIndicators({ input }: { input?: LiveInput }) {
  if (!input) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span
        title={input.is_keyboard_active ? "Keyboard active" : "Keyboard idle"}
        className={`grid h-7 w-7 place-items-center rounded-lg ring-1 ${
          input.is_keyboard_active
            ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
            : "bg-slate-50 text-slate-400 ring-slate-200"
        }`}
      >
        <Keyboard className="h-3.5 w-3.5" />
      </span>
      <span
        title={input.is_mouse_active ? "Mouse active" : "Mouse idle"}
        className={`grid h-7 w-7 place-items-center rounded-lg ring-1 ${
          input.is_mouse_active
            ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
            : "bg-slate-50 text-slate-400 ring-slate-200"
        }`}
      >
        <Mouse className="h-3.5 w-3.5" />
      </span>
      {input.win_r_count > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
          <AlertTriangle className="h-3 w-3" />
          Win+R ×{input.win_r_count}
        </span>
      )}
    </div>
  );
}
