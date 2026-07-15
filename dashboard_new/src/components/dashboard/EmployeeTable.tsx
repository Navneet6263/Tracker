import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { Employee } from "@/data/mockData";
import { getPingStatus, getLiveInput, formatPing } from "@/hooks/useEmployeeStatus";
import { StatusPing } from "./StatusPing";
import { ActivityIndicators } from "./ActivityIndicators";

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-slate-700">{score}</span>
    </div>
  );
}

export function EmployeeTable({ employees }: { employees: Employee[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Workforce Live View</h2>
          <p className="text-xs text-slate-500">Real-time ping and input signals across your team</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {employees.length} members
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3 font-medium">Employee</th>
              <th className="px-5 py-3 font-medium">Productivity</th>
              <th className="px-5 py-3 font-medium">Active Hours</th>
              <th className="px-5 py-3 font-medium">Inputs</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const status = getPingStatus(e.active_hours, e.last_ping);
              return (
                <tr
                  key={e.id}
                  className="group border-b border-slate-50 transition last:border-0 hover:bg-slate-50/60"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-semibold text-white">
                        {e.avatar}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{e.name}</p>
                        <p className="text-xs text-slate-500">{e.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3"><ScoreBar score={e.productivity_score} /></td>
                  <td className="px-5 py-3 tabular-nums text-slate-700">{e.active_hours.toFixed(1)}h</td>
                  <td className="px-5 py-3"><ActivityIndicators input={getLiveInput(e.id)} /></td>
                  <td className="px-5 py-3"><StatusPing status={status} label={formatPing(e.last_ping)} /></td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to="/employees/$id"
                      params={{ id: e.id }}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 opacity-0 transition group-hover:opacity-100 hover:bg-indigo-50"
                    >
                      View <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
