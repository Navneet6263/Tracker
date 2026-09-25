import React from "react";
import { Calendar, ChevronRight, Clock, Laptop, MousePointer, ShieldCheck } from "lucide-react";
import type { DailyBreakdownItem } from "@/lib/api";

interface Props {
  days?: DailyBreakdownItem[];
  currentDate?: string | null;
  onSelectDate: (date: string) => void;
}

export function DailyBreakdownTable({ days = [], currentDate, onSelectDate }: Props) {
  if (!days || days.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Daily Work Breakdown</h3>
        <p className="text-xs text-slate-400">No daily history recorded for this period.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Daily Attendance & Work Records</h3>
            <p className="text-xs text-slate-500">Day-by-day history and productivity breakdown</p>
          </div>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full ring-1 ring-slate-200">
          {days.length} Days Recorded
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <th className="pb-2.5">Date</th>
              <th className="pb-2.5">Active Work</th>
              <th className="pb-2.5">Productivity</th>
              <th className="pb-2.5">VoIP / Calls</th>
              <th className="pb-2.5">Idle / Away</th>
              <th className="pb-2.5">Input Events</th>
              <th className="pb-2.5">Top Application</th>
              <th className="pb-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {days.map((item) => {
              const isSelected = currentDate === item.date;
              return (
                <tr
                  key={item.date}
                  className={`transition-colors hover:bg-slate-50/80 ${
                    isSelected ? "bg-indigo-50/40" : ""
                  }`}
                >
                  <td className="py-3 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{item.date}</span>
                      <span className="text-[11px] text-slate-400">({item.day_name.slice(0, 3)})</span>
                    </div>
                  </td>

                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 tabular-nums">
                        {item.active_hours.toFixed(1)}h
                      </span>
                      <div className="h-1.5 w-14 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full"
                          style={{ width: `${Math.min(100, (item.active_hours / 8) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  <td className="py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        item.productivity_score >= 80
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : item.productivity_score >= 60
                          ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                          : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                      }`}
                    >
                      <ShieldCheck className="h-3 w-3" />
                      {item.productivity_score}%
                    </span>
                  </td>

                  <td className="py-3 text-slate-700 font-medium">
                    {item.meeting_mins > 0 ? (
                      <span className="text-purple-700 font-semibold">{item.meeting_mins}m</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>

                  <td className="py-3 text-slate-600">
                    {item.idle_mins > 0 ? `${item.idle_mins}m` : "0m"}
                  </td>

                  <td className="py-3 text-[11px] text-slate-500 font-mono">
                    {item.keyboard_events + item.mouse_events > 0 ? (
                      <span>
                        {item.keyboard_events.toLocaleString()} kbd · {item.mouse_events.toLocaleString()} mouse
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                  </td>

                  <td className="py-3">
                    {item.top_app ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                        <Laptop className="h-3 w-3 text-slate-400" /> {item.top_app}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>

                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectDate(item.date)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        isSelected
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-50"
                      }`}
                    >
                      {isSelected ? "Inspecting" : "Inspect Day"}
                      <ChevronRight className="h-3 w-3" />
                    </button>
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
