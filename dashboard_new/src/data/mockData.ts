// Centralized mock data. Do NOT hardcode data inside UI components.

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
  productivity_score: number;
  active_hours: number;
  last_ping: string; // ISO timestamp
}

export interface Screenshot {
  id: string;
  employee_id: string;
  url: string;
  window_title: string;
  timestamp: string;
}

export interface LiveInput {
  employee_id: string;
  is_keyboard_active: boolean;
  is_mouse_active: boolean;
  win_r_count: number;
}

export interface MobileLog {
  employee_id: string;
  call_number: string;
  duration: number;
  app_notification: string;
}

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

export const employees: Employee[] = [
  { id: "e1", name: "Aarav Sharma", email: "aarav@company.com", role: "Frontend Engineer", avatar: "AS", productivity_score: 92, active_hours: 6.4, last_ping: minutesAgo(1) },
  { id: "e2", name: "Priya Nair", email: "priya@company.com", role: "Product Designer", avatar: "PN", productivity_score: 88, active_hours: 5.8, last_ping: minutesAgo(3) },
  { id: "e3", name: "Rohan Verma", email: "rohan@company.com", role: "Backend Engineer", avatar: "RV", productivity_score: 47, active_hours: 4.2, last_ping: minutesAgo(22) },
  { id: "e4", name: "Isha Kapoor", email: "isha@company.com", role: "QA Analyst", avatar: "IK", productivity_score: 76, active_hours: 5.1, last_ping: minutesAgo(2) },
  { id: "e5", name: "Kabir Singh", email: "kabir@company.com", role: "DevOps Engineer", avatar: "KS", productivity_score: 81, active_hours: 7.2, last_ping: minutesAgo(8) },
  { id: "e6", name: "Meera Iyer", email: "meera@company.com", role: "Data Analyst", avatar: "MI", productivity_score: 63, active_hours: 3.9, last_ping: minutesAgo(35) },
  { id: "e7", name: "Devansh Patel", email: "devansh@company.com", role: "Support Lead", avatar: "DP", productivity_score: 95, active_hours: 6.9, last_ping: minutesAgo(1) },
  { id: "e8", name: "Sanya Mehta", email: "sanya@company.com", role: "HR Partner", avatar: "SM", productivity_score: 70, active_hours: 4.5, last_ping: minutesAgo(4) },
];

export const screenshots: Screenshot[] = employees.flatMap((e, idx) =>
  Array.from({ length: 6 }).map((_, i) => ({
    id: `${e.id}-s${i}`,
    employee_id: e.id,
    url: `https://picsum.photos/seed/${e.id}${i}/480/300`,
    window_title: [
      "VS Code — dashboard.tsx",
      "Figma — Design System",
      "Chrome — Jira Board",
      "Slack — #engineering",
      "Notion — Sprint Notes",
      "Terminal — bun dev",
    ][(i + idx) % 6],
    timestamp: minutesAgo(i * 12 + 3),
  })),
);

export const liveInputs: LiveInput[] = [
  { employee_id: "e1", is_keyboard_active: true, is_mouse_active: true, win_r_count: 0 },
  { employee_id: "e2", is_keyboard_active: true, is_mouse_active: false, win_r_count: 0 },
  { employee_id: "e3", is_keyboard_active: false, is_mouse_active: false, win_r_count: 3 },
  { employee_id: "e4", is_keyboard_active: true, is_mouse_active: true, win_r_count: 0 },
  { employee_id: "e5", is_keyboard_active: false, is_mouse_active: true, win_r_count: 1 },
  { employee_id: "e6", is_keyboard_active: false, is_mouse_active: false, win_r_count: 2 },
  { employee_id: "e7", is_keyboard_active: true, is_mouse_active: true, win_r_count: 0 },
  { employee_id: "e8", is_keyboard_active: true, is_mouse_active: true, win_r_count: 0 },
];

export const mobileLogs: MobileLog[] = [
  { employee_id: "e3", call_number: "+91 98•••••210", duration: 412, app_notification: "WhatsApp" },
  { employee_id: "e6", call_number: "+91 90•••••118", duration: 128, app_notification: "Instagram" },
];

export const weeklyActivity = (employeeId: string) => {
  const seed = employeeId.charCodeAt(1) || 1;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((d, i) => ({
    day: d,
    active: Math.max(2, ((seed * (i + 2)) % 8) + 1),
    idle: Math.max(0.5, ((seed * (i + 1)) % 3) + 0.5),
  }));
};
