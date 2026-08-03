import { useState } from "react";
import { Camera, Loader2, CheckCircle2, Power } from "lucide-react";
import { requestScreenshot, fetchScreenshots, stopClient } from "@/lib/api";

interface Props { employeeId: string; employeeName: string }

type State = "idle" | "requesting" | "done" | "error";

export function OnDemandScreenshot({ employeeId, employeeName }: Props) {
  const [state, setState] = useState<State>("idle");
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [stopped, setStopped] = useState(false);

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

    setTimeout(() => pollForNewScreenshot(oldLatestId, retries - 1), 2000);
  };

  const requestSnapshot = async () => {
    setState("requesting");
    try {
      const initialShots = await fetchScreenshots(Number(employeeId));
      const oldLatestId = initialShots.length > 0 ? initialShots[0].id : undefined;

      await requestScreenshot(Number(employeeId));
      pollForNewScreenshot(oldLatestId, 10);
    } catch {
      setState("error");
    }
  };

  const handleStopClient = async () => {
    if (!confirm(`Are you sure you want to stop tracking for ${employeeName}? This will shut down the desktop client on their computer.`)) return;
    setStopping(true);
    try {
      await stopClient(Number(employeeId));
      setStopped(true);
      alert(`Remote stop command sent! Employee tracker for ${employeeName} will turn off in 3 seconds.`);
    } catch {
      alert("Failed to send stop command.");
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Live Screenshot & Remote Controls</h3>
          <p className="text-xs text-slate-400 mt-0.5">See what {employeeName.split(" ")[0]} is doing right now or manage tracking</p>
        </div>
        <div className="flex items-center gap-2">
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
          
          <button
            onClick={handleStopClient}
            disabled={stopping || stopped}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
            title="Turn off employee tracker remotely on their PC"
          >
            {stopping ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Stopping…</>
            ) : stopped ? (
              <><Power className="h-3.5 w-3.5" /> Client Stopped</>
            ) : (
              <><Power className="h-3.5 w-3.5" /> Turn Off Tracker</>
            )}
          </button>
        </div>
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
          ⚠️ Employee tracker did not respond. They may be offline or stopped.
        </p>
      )}

      {state === "idle" && (
        <div className="mt-3 flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
          Click "Take Screenshot Now" for a live snapshot, or "Turn Off Tracker" to stop tracking remotely.
        </div>
      )}
    </div>
  );
}
