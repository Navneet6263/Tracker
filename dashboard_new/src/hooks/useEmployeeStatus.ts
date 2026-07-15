import { employees, liveInputs } from "@/data/mockData";

export type PingStatus = "active" | "idle" | "tamper";

export function getPingStatus(active_hours: number, last_ping: string): PingStatus {
  const ageMin = (Date.now() - new Date(last_ping).getTime()) / 60_000;
  if (active_hours > 0 && ageMin > 15) return "tamper";
  if (ageMin > 5) return "idle";
  return "active";
}

export function useDashboardStats() {
  const total = employees.length;
  const active = employees.filter(
    (e) => getPingStatus(e.active_hours, e.last_ping) === "active",
  ).length;
  const avgScore = Math.round(
    employees.reduce((a, e) => a + e.productivity_score, 0) / total,
  );
  const totalHours = employees.reduce((a, e) => a + e.active_hours, 0).toFixed(1);
  const tamperCount = employees.filter(
    (e) => getPingStatus(e.active_hours, e.last_ping) === "tamper",
  ).length;
  const runAlerts = liveInputs.filter((l) => l.win_r_count > 0).length;
  return { total, active, avgScore, totalHours, tamperCount, runAlerts };
}

export function getLiveInput(employeeId: string) {
  return liveInputs.find((l) => l.employee_id === employeeId);
}

export function formatPing(last_ping: string): string {
  const ageMin = Math.round((Date.now() - new Date(last_ping).getTime()) / 60_000);
  if (ageMin < 1) return "just now";
  if (ageMin < 60) return `${ageMin}m ago`;
  return `${Math.floor(ageMin / 60)}h ago`;
}
