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

export function fetchScreenshots(employeeId: number) {
  return apiFetch<ScreenshotItem[]>(`/screenshots/${employeeId}`);
}

export function requestScreenshot(employeeId: number) {
  return apiFetch(`/events/request_screenshot/${employeeId}`, { method: "POST" });
}

export function fetchEvents(employeeId: number) {
  return apiFetch<EventItem[]>(`/events/${employeeId}`);
}

export function getMe() {
  return apiFetch<MeResponse>("/auth/me");
}

// WebSocket URL helper
export function getWsUrl(path: string): string {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws${path}`;
  }
  return BASE_URL.replace(/^http/, "ws") + path;
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface EmployeeSummary {
  id: number;
  name: string;
  email: string;
  productivity_score: number;
  active_hours: number;
  last_ping: string | null;
}

export interface EmployeeAnalytics {
  productivity_score: number;
  active_hours: number;
  keyboard_mins: number;
  mouse_mins: number;
  app_breakdown: { app: string; secs: number; hours: number }[];
  offline_periods: { from: string; to: string; reason: string }[];
}

export interface ScreenshotItem {
  id: number;
  url: string;
  captured_at: string;
  window_title: string;
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
