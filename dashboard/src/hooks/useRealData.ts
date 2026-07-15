// Real data hooks - replaces mockData completely
import { useState, useEffect, useCallback } from "react";
import {
  fetchSummary,
  fetchEmployeeAnalytics,
  fetchScreenshots,
  getWsUrl,
  type EmployeeSummary,
  type EmployeeAnalytics,
  type ScreenshotItem,
} from "@/lib/api";

// ─── Summary hook (used by main dashboard) ───────────────────────────────────
export function useSummary() {
  const [data, setData] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchSummary();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}

// ─── Employee detail hook ─────────────────────────────────────────────────────
export function useEmployeeDetail(id: number, period = "day") {
  const [analytics, setAnalytics] = useState<EmployeeAnalytics | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchEmployeeAnalytics(id, period),
      fetchScreenshots(id),
    ])
      .then(([a, s]) => {
        if (!cancelled) { setAnalytics(a); setScreenshots(s); }
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, period]);

  return { analytics, screenshots, loading, error };
}

// ─── Live WebSocket hook (for real-time active status & keyboard/mouse) ───────
export interface LiveSignal {
  employee_id: number;
  type: string;
  inputs?: { keyboard: boolean; mouse: boolean; win_r_count: number };
}

export function useLiveSignals(adminId: number | null) {
  const [signals, setSignals] = useState<Record<number, LiveSignal>>({});

  useEffect(() => {
    if (!adminId) return;
    const ws = new WebSocket(getWsUrl(`/ws/${adminId}`));

    ws.onmessage = (event) => {
      try {
        const msg: LiveSignal = JSON.parse(event.data);
        if (msg.employee_id) {
          setSignals((prev) => ({ ...prev, [msg.employee_id]: msg }));
          // Auto-clear after 60s (employee went idle)
          setTimeout(() => {
            setSignals((prev) => {
              const next = { ...prev };
              delete next[msg.employee_id];
              return next;
            });
          }, 60_000);
        }
      } catch { /* ignore */ }
    };

    return () => ws.close();
  }, [adminId]);

  return signals;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
export type PingStatus = "active" | "idle" | "tamper";

export function getPingStatus(active_hours: number, last_ping: string | null): PingStatus {
  if (!last_ping) return "idle";
  const ageMin = (Date.now() - new Date(last_ping).getTime()) / 60_000;
  if (active_hours > 0 && ageMin > 15) return "tamper";
  if (ageMin > 5) return "idle";
  return "active";
}

export function formatPing(last_ping: string | null): string {
  if (!last_ping) return "never";
  const ageMin = Math.round((Date.now() - new Date(last_ping).getTime()) / 60_000);
  if (ageMin < 1) return "just now";
  if (ageMin < 60) return `${ageMin}m ago`;
  return `${Math.floor(ageMin / 60)}h ago`;
}
