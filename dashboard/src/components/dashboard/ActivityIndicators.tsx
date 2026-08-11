import { Keyboard, Mouse } from "lucide-react";

export interface LiveInput {
  is_keyboard_active: boolean;
  is_mouse_active: boolean;
}

export function ActivityIndicators({ input }: { input?: LiveInput }) {
  if (!input) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span
        title={input.is_keyboard_active ? "Keyboard active" : "No recent keyboard activity"}
        className={`grid h-7 w-7 place-items-center rounded-lg ring-1 ${
          input.is_keyboard_active
            ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
            : "bg-slate-50 text-slate-400 ring-slate-200"
        }`}
      >
        <Keyboard className="h-3.5 w-3.5" />
      </span>
      <span
        title={input.is_mouse_active ? "Mouse active" : "No recent mouse activity"}
        className={`grid h-7 w-7 place-items-center rounded-lg ring-1 ${
          input.is_mouse_active
            ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
            : "bg-slate-50 text-slate-400 ring-slate-200"
        }`}
      >
        <Mouse className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}
