import { useMemo, useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  Loader2,
  Search,
  X,
  ArrowUpDown,
  Users,
  Sparkles,
} from "lucide-react";
import type { EmployeeSummary } from "@/lib/api";
import { deleteEmployee } from "@/lib/api";
import { getPingStatus, formatPing, type LiveSignal } from "@/hooks/useRealData";
import { StatusPing } from "./StatusPing";
import { ActivityIndicators } from "./ActivityIndicators";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 sm:w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-slate-700">{score}%</span>
    </div>
  );
}

type StatusFilter = "all" | "active" | "meeting" | "idle" | "offline";
type SortOption =
  | "score_desc"
  | "score_asc"
  | "hours_desc"
  | "name_asc"
  | "name_desc"
  | "recent";

interface Props {
  employees: EmployeeSummary[];
  liveSignals?: Record<number, LiveSignal>;
  onDeleted?: (employeeId: number) => void;
  compact?: boolean;
  onViewAll?: () => void;
}

export function EmployeeTable({
  employees,
  liveSignals = {},
  onDeleted,
  compact = false,
  onViewAll,
}: Props) {
  const [targetEmployee, setTargetEmployee] = useState<EmployeeSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("score_desc");

  // Pagination State
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 when search, filter, or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sortBy, pageSize]);

  // Compute status counts across all employees
  const statusCounts = useMemo(() => {
    const counts = { all: employees.length, active: 0, meeting: 0, idle: 0, offline: 0 };
    for (const e of employees) {
      const status = getPingStatus(e.active_hours, e.last_ping, e.current_state);
      if (status === "active" || status === "passive") {
        counts.active++;
      } else if (status === "meeting") {
        counts.meeting++;
      } else if (status === "idle" || status === "locked") {
        counts.idle++;
      } else {
        counts.offline++;
      }
    }
    return counts;
  }, [employees]);

  // Top performers for compact mode (Top 5)
  const topPerformers = useMemo(() => {
    return [...employees]
      .sort((a, b) => {
        if (b.productivity_score !== a.productivity_score) {
          return b.productivity_score - a.productivity_score;
        }
        return b.active_hours - a.active_hours;
      })
      .slice(0, 5);
  }, [employees]);

  // Filter employees based on search & status filter
  const filteredEmployees = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return employees.filter((e) => {
      // Status filter
      if (statusFilter !== "all") {
        const status = getPingStatus(e.active_hours, e.last_ping, e.current_state);
        if (statusFilter === "active" && status !== "active" && status !== "passive") return false;
        if (statusFilter === "meeting" && status !== "meeting") return false;
        if (statusFilter === "idle" && status !== "idle" && status !== "locked") return false;
        if (statusFilter === "offline" && !["offline", "off_shift", "tamper"].includes(status)) return false;
      }
      // Search text
      if (needle) {
        const match =
          e.name.toLowerCase().includes(needle) ||
          e.email.toLowerCase().includes(needle) ||
          (e.current_device && e.current_device.toLowerCase().includes(needle)) ||
          (e.current_app && e.current_app.toLowerCase().includes(needle)) ||
          (e.shift?.name && e.shift.name.toLowerCase().includes(needle));
        if (!match) return false;
      }
      return true;
    });
  }, [employees, statusFilter, searchQuery]);

  // Sort employees
  const sortedEmployees = useMemo(() => {
    const list = [...filteredEmployees];
    switch (sortBy) {
      case "score_desc":
        return list.sort((a, b) => b.productivity_score - a.productivity_score);
      case "score_asc":
        return list.sort((a, b) => a.productivity_score - b.productivity_score);
      case "hours_desc":
        return list.sort((a, b) => b.active_hours - a.active_hours);
      case "name_asc":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case "name_desc":
        return list.sort((a, b) => b.name.localeCompare(a.name));
      case "recent":
        return list.sort((a, b) => {
          const timeA = a.last_ping ? new Date(a.last_ping).getTime() : 0;
          const timeB = b.last_ping ? new Date(b.last_ping).getTime() : 0;
          return timeB - timeA;
        });
      default:
        return list;
    }
  }, [filteredEmployees, sortBy]);

  // Pagination slicing
  const totalPages = Math.max(1, Math.ceil(sortedEmployees.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, sortedEmployees.length);
  const paginatedEmployees = useMemo(() => {
    return sortedEmployees.slice(startIndex, endIndex);
  }, [sortedEmployees, startIndex, endIndex]);

  const handleDelete = async () => {
    if (!targetEmployee) return;
    try {
      setDeleting(true);
      await deleteEmployee(targetEmployee.id);
      onDeleted?.(targetEmployee.id);
      setTargetEmployee(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete employee profile");
    } finally {
      setDeleting(false);
    }
  };

  // Helper to generate smart pagination numbers (e.g. [1, 2, '...', 7, 8])
  const paginationRange = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (safeCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, "...", totalPages];
    }
    if (safeCurrentPage >= totalPages - 3) {
      return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, "...", safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, "...", totalPages];
  }, [totalPages, safeCurrentPage]);

  // ─────────────────────────────────────────────────────────────
  // COMPACT VIEW: Shown on Overview Dashboard (Top 5 Performers)
  // ─────────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Top Active Performers</h2>
              <p className="text-xs text-slate-500">
                Top team members ranked by verified productivity score today
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {employees.length} total members
            </span>
            <button
              type="button"
              onClick={() => {
                if (onViewAll) onViewAll();
                else window.location.hash = "#employees";
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              View Full Directory <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Productivity</th>
                <th className="px-6 py-3">Work / Calls</th>
                <th className="px-6 py-3">Inputs</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Profile</th>
              </tr>
            </thead>
            <tbody>
              {topPerformers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-slate-400">
                    No active employees tracked yet today.
                  </td>
                </tr>
              ) : (
                topPerformers.map((e, index) => {
                  const status = getPingStatus(e.active_hours, e.last_ping, e.current_state);
                  const live = liveSignals[e.id];
                  const liveInput = live?.inputs
                    ? {
                        is_keyboard_active: live.inputs.keyboard,
                        is_mouse_active: live.inputs.mouse,
                      }
                    : undefined;
                  const initials = e.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <tr
                      key={e.id}
                      className="group border-b border-slate-50 transition last:border-0 hover:bg-slate-50/70"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-sm">
                            {initials}
                            <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-white text-[9px] font-black text-indigo-700 shadow-sm">
                              #{index + 1}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition">
                              {e.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {e.identity_mode === "work_account" ? "Verified work account" : e.email}
                            </p>
                            {e.current_device && (
                              <p className="text-[11px] text-slate-400 font-mono">PC: {e.current_device}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <ScoreBar score={e.productivity_score} />
                      </td>
                      <td className="px-6 py-3 tabular-nums text-slate-700 font-medium">
                        {e.active_hours.toFixed(1)}h{" "}
                        <span className="text-slate-400 font-normal">/ {e.meeting_hours.toFixed(1)}h</span>
                      </td>
                      <td className="px-6 py-3">
                        <ActivityIndicators input={liveInput} />
                      </td>
                      <td className="px-6 py-3">
                        <StatusPing status={status} label={formatPing(e.last_ping)} />
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          to="/employees/$id"
                          params={{ id: String(e.id) }}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                        >
                          View <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-3">
          <p className="text-xs text-slate-500">
            Showing top {topPerformers.length} of {employees.length} employees on main overview.
          </p>
          <button
            type="button"
            onClick={() => {
              if (onViewAll) onViewAll();
              else window.location.hash = "#employees";
            }}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
          >
            Open Full Workforce Directory ({employees.length} members) →
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // FULL WORKFORCE DIRECTORY VIEW: Search, Filter, Sort, Pagination
  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-4">
        {/* Top Summary Bar & Status Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          {/* Status filter tabs */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === "all"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({statusCounts.all})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === "active"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Active ({statusCounts.active})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("meeting")}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === "meeting"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-violet-50 text-violet-700 hover:bg-violet-100"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-violet-400" />
              In Call ({statusCounts.meeting})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("idle")}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === "idle"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Idle ({statusCounts.idle})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("offline")}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === "offline"
                  ? "bg-slate-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Offline ({statusCounts.offline})
            </button>
          </div>

          {/* Quick Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3" /> Sort:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="score_desc">Highest Productivity</option>
              <option value="score_asc">Lowest Productivity</option>
              <option value="hours_desc">Most Active Hours</option>
              <option value="name_asc">Name (A → Z)</option>
              <option value="name_desc">Name (Z → A)</option>
              <option value="recent">Recently Active</option>
            </select>
          </div>
        </div>

        {/* Full Table Card */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
          {/* Table Header & Search Input */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-600" />
                <h2 className="text-sm font-semibold text-slate-900">Workforce Directory</h2>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                  {filteredEmployees.length} of {employees.length}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time ping, device info, active applications and shift tracking
              </p>
            </div>

            {/* Instant Search Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, email, PC or app..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-1.5 pl-8 pr-8 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="cursor-pointer absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Table Element */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Employee</th>
                  <th className="px-6 py-3">Productivity</th>
                  <th className="px-6 py-3">Work / Calls</th>
                  <th className="px-6 py-3">Inputs</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="mx-auto max-w-sm space-y-2">
                        <Users className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="text-sm font-semibold text-slate-700">No employees match criteria</p>
                        <p className="text-xs text-slate-400">
                          Try searching for another name, email, or device, or clear your current filter.
                        </p>
                        {(searchQuery || statusFilter !== "all") && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery("");
                              setStatusFilter("all");
                            }}
                            className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
                          >
                            Reset all filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map((e) => {
                    const status = getPingStatus(e.active_hours, e.last_ping, e.current_state);
                    const live = liveSignals[e.id];
                    const liveInput = live?.inputs
                      ? {
                          is_keyboard_active: live.inputs.keyboard,
                          is_mouse_active: live.inputs.mouse,
                        }
                      : undefined;
                    const initials = e.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <tr
                        key={e.id}
                        className="group border-b border-slate-50 transition last:border-0 hover:bg-slate-50/70"
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-sm">
                              {initials}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition">
                                {e.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {e.identity_mode === "work_account" ? "Verified work account" : e.email}
                              </p>
                              {e.current_device && (
                                <p className="text-[11px] font-mono text-slate-400">PC: {e.current_device}</p>
                              )}
                              <p className="mt-0.5 text-[11px] text-indigo-600 font-medium">
                                {e.shift
                                  ? `${e.shift.name} · ${e.shift.start}–${e.shift.end}`
                                  : e.identity_mode === "work_account"
                                  ? "Rotating work sessions"
                                  : "Learning shift · needs 2 working days"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <ScoreBar score={e.productivity_score} />
                        </td>
                        <td className="px-6 py-3 tabular-nums text-slate-700 font-medium">
                          {e.active_hours.toFixed(1)}h{" "}
                          <span className="text-slate-400 font-normal">/ {e.meeting_hours.toFixed(1)}h</span>
                        </td>
                        <td className="px-6 py-3">
                          <ActivityIndicators input={liveInput} />
                        </td>
                        <td className="px-6 py-3">
                          <StatusPing status={status} label={formatPing(e.last_ping)} />
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              to="/employees/$id"
                              params={{ id: String(e.id) }}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                            >
                              View <ChevronRight className="h-3 w-3" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => setTargetEmployee(e)}
                              className="inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-slate-400 opacity-60 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                              title={`Delete ${e.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredEmployees.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-3.5">
              {/* Left: Row info & Page Size Selector */}
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>
                  Showing <strong className="font-semibold text-slate-700">{startIndex + 1}</strong>–
                  <strong className="font-semibold text-slate-700">{endIndex}</strong> of{" "}
                  <strong className="font-semibold text-slate-700">{filteredEmployees.length}</strong> employees
                </span>

                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
                  <span>Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {/* Right: Page Buttons */}
              <div className="flex items-center gap-1">
                {/* First Page */}
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={safeCurrentPage === 1}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="First Page"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>

                {/* Previous Page */}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage === 1}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                {/* Page Number Pills */}
                {paginationRange.map((page, idx) => {
                  if (page === "...") {
                    return (
                      <span key={`ellipsis-${idx}`} className="px-1 text-xs text-slate-400">
                        …
                      </span>
                    );
                  }
                  const isCurrent = page === safeCurrentPage;
                  return (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(Number(page))}
                      className={`grid h-7 min-w-7 cursor-pointer place-items-center rounded-lg px-1.5 text-xs font-semibold transition ${
                        isCurrent
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}

                {/* Next Page */}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Next Page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>

                {/* Last Page */}
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safeCurrentPage === totalPages}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Last Page"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!targetEmployee}
        onOpenChange={(open) => {
          if (!open && !deleting) setTargetEmployee(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee Profile</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm text-slate-600">
              Are you sure you want to permanently delete <strong>{targetEmployee?.name}</strong> (
              {targetEmployee?.email})?
              <br />
              <br />
              This will remove their profile, all tracked activity history, application usage, and shift
              assignments directly from the database. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="cursor-pointer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="cursor-pointer bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Deleting…
                </>
              ) : (
                "Delete Profile"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
