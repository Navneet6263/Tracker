// Real API client - connects to the FastAPI backend
// Set VITE_API_URL in your .env file for production (e.g. https://your-render-url.onrender.com)

const BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? `${window.location.origin}/api`
    : "http://localhost:8000");

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function getWsToken(): string {
  return getToken() ?? "";
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
    }
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export async function login(email: string, password: string) {
  const body = new URLSearchParams({ username: email, password });
  const res = await fetch(`${BASE_URL}/auth/login`, { method: "POST", body });
  if (!res.ok) throw new Error("Login failed");
  const data = await res.json();
  localStorage.setItem("token", data.access_token);
  return data;
}

export function logout() {
  localStorage.removeItem("token");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export function fetchSummary() {
  return apiFetch<EmployeeSummary[]>("/analytics/summary");
}

export function fetchEmployeeAnalytics(id: number, period = "day") {
  return apiFetch<EmployeeAnalytics>(`/analytics/employee/${id}?period=${period}`);
}

export function stopClient(employeeId: number | string) {
  return apiFetch(`/events/stop_client/${employeeId}`, { method: "POST" });
}

export function fetchEvents(employeeId: number) {
  return apiFetch<EventItem[]>(`/events/${employeeId}`);
}

export function getMe() {
  return apiFetch<MeResponse>("/auth/me");
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ status: string }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

// WebSocket URL helper
export function getWsUrl(path: string): string {
  const cleanPath = path.startsWith("/ws") ? path : `/ws${path.startsWith("/") ? "" : "/"}${path}`;
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${cleanPath}`;
  }
  const cleanBaseUrl = BASE_URL.replace(/\/api\/?$/, "").replace(/^http/, "ws");
  return `${cleanBaseUrl}${cleanPath}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface EmployeeSummary {
  id: number;
  name: string;
  email: string;
  productivity_score: number;
  active_hours: number;
  meeting_hours: number;
  last_ping: string | null;
  current_state: string;
  current_app: string | null;
  shift: {
    name: string;
    start: string;
    end: string;
    timezone: string;
    automatic?: boolean;
  } | null;
}

export interface EmployeeAnalytics {
  productivity_score: number;
  active_hours: number;
  keyboard_mins: number;
  mouse_mins: number;
  keyboard_events: number;
  mouse_events: number;
  meeting_mins: number;
  passive_mins: number;
  idle_mins: number;
  locked_mins: number;
  state_breakdown: Record<string, number>;
  app_breakdown: { app: string; category: string; secs: number; hours: number }[];
  page_breakdown: { app: string; title: string; secs: number }[];
  offline_periods: { from: string; to: string; reason: string }[];
}

export interface EventItem {
  id: number;
  event_type: string;
  payload: string;
  occurred_at: string;
}

export interface MeResponse {
  id: number;
  name: string;
  email: string;
  role: string;
}
