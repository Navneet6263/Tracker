import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Calendar,
  Check,
  CheckCheck,
  Clock,
  Coffee,
  ExternalLink,
  Headphones,
  Laptop,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserX,
  X,
  Zap,
} from "lucide-react";
import { fetchWorkDeclines, type EmployeeSummary, type WorkDecline } from "@/lib/api";

export interface NotificationItem {
  id: string;
  category: "alert" | "activity" | "shift";
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  employeeId?: number;
  employeeName?: string;
  timestamp: string;
  timeAgo: string;
  meta?: string;
}

function minutesSince(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const normalized = value.endsWith("Z") || value.includes("+") ? value : `${value}Z`;
  return (Date.now() - new Date(normalized).getTime()) / 60_000;
}

function formatRelativeTime(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  directory: EmployeeSummary[];
}

export function NotificationCenter({ directory }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "alert" | "activity" | "shift">("all");
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("sentinel_read_notifs");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [workDeclines, setWorkDeclines] = useState<WorkDecline[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch work declines on mount and periodically
  useEffect(() => {
    fetchWorkDeclines()
      .then((declines) => setWorkDeclines(declines || []))
      .catch(() => setWorkDeclines([]));

    const timer = setInterval(() => {
      fetchWorkDeclines()
        .then((declines) => setWorkDeclines(declines || []))
        .catch(() => undefined);
    }, 45_000);

    return () => clearInterval(timer);
  }, []);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Generate live notifications
  const rawNotifications: NotificationItem[] = useMemo(() => {
    const items: NotificationItem[] = [];

    // 1. Work declines / Cancelled check-ins
    workDeclines.forEach((dec) => {
      const mins = minutesSince(dec.created_at);
      items.push({
        id: `decline_${dec.id}`,
        category: "alert",
        severity: "critical",
        title: "Check-In Cancelled",
        message: `${dec.employee_name} cancelled tracking check-in (${dec.reason})`,
        employeeId: dec.employee_id,
        employeeName: dec.employee_name,
        timestamp: dec.created_at,
        timeAgo: formatRelativeTime(mins),
        meta: dec.device_name,
      });
    });

    // 2. Employee live states
    directory.forEach((emp) => {
      const age = minutesSince(emp.last_ping);

      // Signal lost / disconnect (>15 min)
      if (emp.current_state !== "off_shift" && age > 15) {
        items.push({
          id: `tamper_${emp.id}`,
          category: "alert",
          severity: "critical",
          title: "Signal Disconnected",
          message: `${emp.name}'s desktop tracker stopped reporting`,
          employeeId: emp.id,
          employeeName: emp.name,
          timestamp: emp.last_ping || new Date().toISOString(),
          timeAgo: formatRelativeTime(age),
          meta: emp.current_device || "Windows Workstation",
        });
      }
      // Offline warning (5 to 15 min)
      else if (emp.current_state !== "off_shift" && age > 5) {
        items.push({
          id: `offline_${emp.id}`,
          category: "alert",
          severity: "warning",
          title: "Tracker Went Offline",
          message: `${emp.name} is currently offline`,
          employeeId: emp.id,
          employeeName: emp.name,
          timestamp: emp.last_ping || new Date().toISOString(),
          timeAgo: formatRelativeTime(age),
          meta: emp.current_device || undefined,
        });
      }

      // Idle Alert
      if (emp.current_state === "idle") {
        items.push({
          id: `idle_${emp.id}`,
          category: "activity",
          severity: "warning",
          title: "Idle Past 5m Threshold",
          message: `${emp.name} has had no keyboard/mouse input`,
          employeeId: emp.id,
          employeeName: emp.name,
          timestamp: emp.last_ping || new Date().toISOString(),
          timeAgo: formatRelativeTime(age),
          meta: "Away / Idle",
        });
      }

      // Screen Locked
      if (emp.current_state === "locked") {
        items.push({
          id: `lock_${emp.id}`,
          category: "activity",
          severity: "info",
          title: "Screen Locked",
          message: `${emp.name} locked their PC screen`,
          employeeId: emp.id,
          employeeName: emp.name,
          timestamp: emp.last_ping || new Date().toISOString(),
          timeAgo: formatRelativeTime(age),
          meta: "Win+L Lock Screen",
        });
      }

      // Active VoIP Meeting
      if (emp.current_state === "meeting") {
        items.push({
          id: `meeting_${emp.id}`,
          category: "activity",
          severity: "info",
          title: "In VoIP Meeting",
          message: `${emp.name} is in a client call on ${emp.current_app || "Conference"}`,
          employeeId: emp.id,
          employeeName: emp.name,
          timestamp: emp.last_ping || new Date().toISOString(),
          timeAgo: formatRelativeTime(age),
          meta: emp.current_app || "VoIP Call",
        });
      }

      // Overtime / Shift Ended Active
      if (emp.current_state === "active" && emp.shift?.end) {
        try {
          const [endH, endM] = emp.shift.end.split(":").map(Number);
          const now = new Date();
          const currentH = now.getHours();
          const currentM = now.getMinutes();
          if (currentH > endH || (currentH === endH && currentM >= endM)) {
            items.push({
              id: `overtime_${emp.id}`,
              category: "shift",
              severity: "info",
              title: "Overtime in Progress",
              message: `${emp.name} opted to continue working after shift ended (${emp.shift.end})`,
              employeeId: emp.id,
              employeeName: emp.name,
              timestamp: now.toISOString(),
              timeAgo: "Active",
              meta: `Shift: ${emp.shift.name}`,
            });
          }
        } catch {
          // ignore time parse
        }
      }
    });

    return items;
  }, [directory, workDeclines]);

  // Filter out dismissed notifications
  const notifications = useMemo(
    () => rawNotifications.filter((n) => !dismissedIds.has(n.id)),
    [rawNotifications, dismissedIds]
  );

  // Tab filtered notifications
  const displayedNotifications = useMemo(() => {
    if (activeTab === "all") return notifications;
    return notifications.filter((n) => n.category === activeTab);
  }, [notifications, activeTab]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  const hasCritical = useMemo(
    () => notifications.some((n) => n.severity === "critical" && !readIds.has(n.id)),
    [notifications, readIds]
  );

  const markAllRead = () => {
    const allIds = new Set(notifications.map((n) => n.id));
    setReadIds(allIds);
    try {
      localStorage.setItem("sentinel_read_notifs", JSON.stringify([...allIds]));
    } catch {
      // ignore
    }
  };

  const markSingleRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem("sentinel_read_notifs", JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const dismissNotification = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  const clearAll = () => {
    const allIds = new Set(notifications.map((n) => n.id));
    setDismissedIds(allIds);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        aria-label="Open notifications"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative grid h-9 w-9 place-items-center rounded-xl border transition cursor-pointer ${
          isOpen
            ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-xs"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`}
      >
        {hasCritical ? (
          <BellRing className="h-4 w-4 text-rose-600 animate-bounce" />
        ) : (
          <Bell className="h-4 w-4" />
        )}

        {/* Counter Badge */}
        {unreadCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-[10px] font-bold text-white shadow-xs ${
              hasCritical ? "bg-rose-600 ring-2 ring-rose-100" : "bg-indigo-600 ring-2 ring-indigo-100"
            }`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Advanced Notification Popover */}
      {isOpen && (
        <div className="absolute right-0 top-11 z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900">Notifications</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    {unreadCount} New
                  </span>
                )}
              </div>

              {/* Header Action Buttons */}
              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    title="Mark all as read"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-white hover:text-indigo-600 transition"
                  >
                    <CheckCheck className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Read all</span>
                  </button>
                )}

                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    title="Clear notification list"
                    className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-rose-600 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="mt-2.5 flex items-center gap-1 border-t border-slate-200/50 pt-2 text-[11px]">
              {(
                [
                  { id: "all", label: `All (${notifications.length})` },
                  {
                    id: "alert",
                    label: `Alerts (${notifications.filter((n) => n.category === "alert").length})`,
                  },
                  {
                    id: "activity",
                    label: `Activity (${notifications.filter((n) => n.category === "activity").length})`,
                  },
                  {
                    id: "shift",
                    label: `Shifts (${notifications.filter((n) => n.category === "shift").length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    activeTab === tab.id
                      ? "bg-white text-indigo-700 shadow-2xs ring-1 ring-slate-200"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications Scroll List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {displayedNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 mb-2">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-slate-800">All Trackers Reporting Normally</p>
                <p className="mt-1 text-[11px] text-slate-400 max-w-[220px]">
                  No active signal losses, extended idles, or cancelled check-ins.
                </p>
              </div>
            ) : (
              displayedNotifications.map((notif) => {
                const isRead = readIds.has(notif.id);

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      markSingleRead(notif.id);
                      if (notif.employeeId) {
                        window.location.href = `/employees/${notif.employeeId}`;
                      }
                    }}
                    className={`group relative flex items-start gap-3 p-3.5 transition cursor-pointer hover:bg-slate-50/80 ${
                      !isRead ? "bg-indigo-50/20" : ""
                    }`}
                  >
                    {/* Severity Icon */}
                    <div
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white shadow-2xs ${
                        notif.severity === "critical"
                          ? "bg-rose-600"
                          : notif.severity === "warning"
                          ? "bg-amber-500"
                          : notif.category === "shift"
                          ? "bg-indigo-600"
                          : "bg-slate-700"
                      }`}
                    >
                      {notif.severity === "critical" ? (
                        <ShieldAlert className="h-4 w-4" />
                      ) : notif.title.includes("Idle") ? (
                        <Coffee className="h-4 w-4" />
                      ) : notif.title.includes("Lock") ? (
                        <Lock className="h-4 w-4" />
                      ) : notif.title.includes("Meeting") ? (
                        <Headphones className="h-4 w-4" />
                      ) : notif.category === "shift" ? (
                        <Clock className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-xs truncate ${!isRead ? "font-bold text-slate-900" : "font-semibold text-slate-800"}`}>
                          {notif.title}
                        </p>
                        <span className="text-[10px] text-slate-400 font-medium shrink-0">
                          {notif.timeAgo}
                        </span>
                      </div>

                      <p className="mt-0.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>

                      {/* Meta badge */}
                      {notif.meta && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {notif.meta}
                          </span>
                          {notif.employeeName && (
                            <span className="text-[10px] font-semibold text-indigo-600 flex items-center gap-0.5 group-hover:underline">
                              View Profile <ExternalLink className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Unread dot / Dismiss button */}
                    <div className="absolute top-3.5 right-3 flex items-center">
                      {!isRead && (
                        <span className="h-2 w-2 rounded-full bg-indigo-600 group-hover:hidden" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => dismissNotification(e, notif.id)}
                        className="hidden group-hover:grid h-5 w-5 place-items-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                        title="Dismiss notification"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Status Bar */}
          <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live monitoring enabled
            </span>
            <a
              href="/#activity"
              onClick={() => setIsOpen(false)}
              className="font-semibold text-indigo-600 hover:underline"
            >
              Activity Feed →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
