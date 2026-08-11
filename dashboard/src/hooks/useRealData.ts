// Real data hooks - replaces mockData completely
import { useState, useEffect, useCallback } from "react";
import {
  fetchSummary,
  fetchEmployeeAnalytics,
  getWsUrl,
  getWsToken,
  type EmployeeSummary,
  type EmployeeAnalytics,
} from "@/lib/api";

// ─── Summary hook (used by main dashboard) ───────────────────────────────────
export function useSummary() {
  const [data, setData] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetchSummary();
      setData(res);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return { data, loading, error, refetch: load };
}

// ─── Employee detail hook ─────────────────────────────────────────────────────
export function useEmployeeDetail(id: number, period = "day") {
  const [analytics, setAnalytics] = useState<EmployeeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEmployeeAnalytics(id, period)
      .then((result) => {
        if (!cancelled) setAnalytics(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, period]);

  return { analytics, loading, error };
}

// ─── Live WebSocket hook (for real-time active status & keyboard/mouse) ───────
export interface LiveSignal {
  employee_id: number;
  type: string;
  state?: string;
  app_name?: string | null;
  inputs?: {
    keyboard: boolean;
    mouse: boolean;
    keyboard_events?: number;
    mouse_events?: number;
  };
}

export function useLiveSignals(adminId: number | null) {
  const [signals, setSignals] = useState<Record<number, LiveSignal>>({});

  useEffect(() => {
    if (!adminId) return;
    const ws = new WebSocket(getWsUrl("/ws/admin"));
    ws.onopen = () => ws.send(JSON.stringify({ token: getWsToken() }));

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
      } catch {
        /* ignore */
      }
    };

    return () => ws.close();
  }, [adminId]);

  return signals;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
export type PingStatus =
  "active" | "meeting" | "passive" | "idle" | "locked" | "off_shift" | "offline" | "tamper";

function parseUtcDate(dateStr: string | null): Date {
  if (!dateStr) return new Date(0);
  const normalized = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : `${dateStr}Z`;
  return new Date(normalized);
}

export function getPingStatus(
  active_hours: number,
  last_ping: string | null,
  current_state?: string,
): PingStatus {
  if (!last_ping) return "offline";
  const ageMin = (Date.now() - parseUtcDate(last_ping).getTime()) / 60_000;
  if (current_state === "off_shift" && ageMin <= 5) return "off_shift";
  if (active_hours > 0 && ageMin > 15) return "tamper";
  if (ageMin > 5) return "offline";
  if (["meeting", "passive", "idle", "locked"].includes(current_state ?? "")) {
    return current_state as PingStatus;
  }
  return "active";
}

export function formatPing(last_ping: string | null): string {
  if (!last_ping) return "never";
  const ageMin = Math.round((Date.now() - parseUtcDate(last_ping).getTime()) / 60_000);
  if (ageMin < 1) return "just now";
  if (ageMin < 60) return `${ageMin}m ago`;
  const hours = Math.floor(ageMin / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
