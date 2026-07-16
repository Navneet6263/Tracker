import { useState } from "react";
import { Camera, Loader2, CheckCircle2 } from "lucide-react";
import { requestScreenshot, fetchScreenshots } from "@/lib/api";

interface Props { employeeId: string; employeeName: string }

type State = "idle" | "requesting" | "done" | "error";

export function OnDemandScreenshot({ employeeId, employeeName }: Props) {
  const [state, setState] = useState<State>("idle");
  const [shotUrl, setShotUrl] = useState<string | null>(null);

  const pollForNewScreenshot = async (oldLatestId?: number, retries = 10) => {
    if (retries === 0) {
      setState("error");
      return;
    }
    
    try {
      const shots = await fetchScreenshots(Number(employeeId));
      if (shots.length > 0) {
        const latest = shots[0];
        if (!oldLatestId || latest.id !== oldLatestId) {
          setShotUrl(latest.url);
          setState("done");
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    // Wait 2 seconds and poll again
    setTimeout(() => pollForNewScreenshot(oldLatestId, retries - 1), 2000);
  };

  const requestSnapshot = async () => {
    setState("requesting");
    try {
      // Get current latest screenshot ID so we know when a new one arrives
      const initialShots = await fetchScreenshots(Number(employeeId));
      const oldLatestId = initialShots.length > 0 ? initialShots[0].id : undefined;

      await requestScreenshot(Number(employeeId));
      
      // Start polling for the new one (up to 20 seconds wait)
      pollForNewScreenshot(oldLatestId, 10);
    } catch {
      setState("error");
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Live Screenshot</h3>
          <p className="text-xs text-slate-400 mt-0.5">See what {employeeName.split(" ")[0]} is doing right now</p>
        </div>
        <button
          onClick={requestSnapshot}
          disabled={state === "requesting"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {state === "requesting" ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Capturing…</>
          ) : (
            <><Camera className="h-3.5 w-3.5" /> Take Screenshot Now</>
          )}
        </button>
      </div>

      {state === "done" && shotUrl && (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Captured just now — live view
          </div>
          <img src={shotUrl} alt="Live screenshot" className="w-full object-cover" />
        </div>
      )}

      {state === "error" && (
        <p className="mt-3 text-xs text-rose-600">
          ⚠️ Employee tracker did not respond. They may be offline.
        </p>
      )}

      {state === "idle" && (
        <div className="mt-3 flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
          Click the button to capture a real-time screenshot
        </div>
      )}
    </div>
  );
}
