import React, { useState } from "react";
import { Clock, Info, Laptop, MessageSquare, ShieldAlert } from "lucide-react";
import type { HourlySlot } from "@/lib/api";

interface Props {
  timeline?: HourlySlot[];
  selectedDate?: string | null;
}

export function HourlyActivityTimeline({ timeline = [], selectedDate }: Props) {
  const [hoveredSlot, setHoveredSlot] = useState<HourlySlot | null>(null);

  // Focus business / active hours (e.g. 07:00 to 21:00) or all 24h
  const slotsToDisplay = timeline.length > 0
    ? timeline.filter((slot) => slot.hour_int >= 7 && slot.hour_int <= 21)
    : [];

  const hasAnyActivity = timeline.some((s) => s.has_activity);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
      {/* Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Hourly Activity Timeline</h3>
            <p className="text-xs text-slate-500">
              {selectedDate ? `Activity distribution for ${selectedDate}` : "Hour-by-hour activity timeline"}
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
            <span>Active Work</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-purple-500" />
            <span>VoIP / Calls</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-sky-400" />
            <span>Passive Work</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-amber-400" />
            <span>Idle / Away</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-slate-300" />
            <span>Locked</span>
          </div>
        </div>
      </div>

      {!hasAnyActivity ? (
        <div className="flex h-36 flex-col items-center justify-center rounded-xl bg-slate-50/70 text-center p-4">
          <Info className="h-5 w-5 text-slate-400 mb-1" />
          <p className="text-xs font-medium text-slate-600">No activity recorded for this specific date.</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Use the date navigator above to check previous days or choose a date with active sessions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Timeline Bar Slots */}
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-15 gap-1.5 items-end pt-4 pb-1">
            {slotsToDisplay.map((slot) => {
              const activeM = slot.active_mins;
              const meetM = slot.meeting_mins;
              const passM = slot.passive_mins;
              const idleM = slot.idle_mins;
              const lockM = slot.locked_mins;

              const totalTracked = activeM + meetM + passM + idleM + lockM;
              const hasWork = totalTracked > 0;

              // Normalized height (max 60m per hour)
              const maxHour = 60;
              const activeH = Math.min(100, (activeM / maxHour) * 100);
              const meetH = Math.min(100, (meetM / maxHour) * 100);
              const passH = Math.min(100, (passM / maxHour) * 100);
              const idleH = Math.min(100, (idleM / maxHour) * 100);
              const lockH = Math.min(100, (lockM / maxHour) * 100);

              const isHovered = hoveredSlot?.hour_int === slot.hour_int;

              return (
                <div
                  key={slot.hour}
                  onMouseEnter={() => setHoveredSlot(slot)}
                  onMouseLeave={() => setHoveredSlot(null)}
                  className={`group relative flex flex-col items-center cursor-pointer transition-all duration-150 ${
                    isHovered ? "scale-105 z-10" : ""
                  }`}
                >
                  {/* Vertical bar container */}
                  <div className="relative flex flex-col justify-end w-full h-24 rounded-lg bg-slate-100/80 p-0.5 overflow-hidden ring-1 ring-slate-200/60 group-hover:ring-indigo-400 group-hover:shadow-sm">
                    {hasWork ? (
                      <div className="w-full flex flex-col-reverse justify-start h-full">
                        {/* Active */}
                        {activeH > 0 && (
                          <div
                            style={{ height: `${activeH}%` }}
                            className="w-full bg-emerald-500 rounded-xs transition-all"
                          />
                        )}
                        {/* Meeting */}
                        {meetH > 0 && (
                          <div
                            style={{ height: `${meetH}%` }}
                            className="w-full bg-purple-500 rounded-xs transition-all"
                          />
                        )}
                        {/* Passive */}
                        {passH > 0 && (
                          <div
                            style={{ height: `${passH}%` }}
                            className="w-full bg-sky-400 rounded-xs transition-all"
                          />
                        )}
                        {/* Idle */}
                        {idleH > 0 && (
                          <div
                            style={{ height: `${idleH}%` }}
                            className="w-full bg-amber-400 rounded-xs transition-all"
                          />
                        )}
                        {/* Locked */}
                        {lockH > 0 && (
                          <div
                            style={{ height: `${lockH}%` }}
                            className="w-full bg-slate-300 rounded-xs transition-all"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="h-1 w-full bg-slate-200 rounded-xs self-end" />
                    )}
                  </div>

                  {/* Hour label */}
                  <span className={`mt-1.5 text-[10px] font-mono transition-colors ${
                    isHovered ? "font-bold text-indigo-600" : "text-slate-500"
                  }`}>
                    {slot.hour.slice(0, 2)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Interactive Inspection Card when hovering */}
          {hoveredSlot && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-slate-700 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/70 pb-2">
                <span className="font-semibold text-indigo-950 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-indigo-600" />
                  Time Slot: {hoveredSlot.hour} – {String(hoveredSlot.hour_int + 1).padStart(2, "0")}:00
                </span>
                {hoveredSlot.top_app && (
                  <span className="font-medium text-indigo-700 bg-white px-2 py-0.5 rounded-full ring-1 ring-indigo-200 text-[11px] flex items-center gap-1">
                    <Laptop className="h-3 w-3" /> Top App: {hoveredSlot.top_app}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 pt-1 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Active Work:</span>
                  <span className="font-semibold text-emerald-700">{hoveredSlot.active_mins}m</span>
                </div>
                <div>
                  <span className="text-slate-500 block">VoIP Calls:</span>
                  <span className="font-semibold text-purple-700">{hoveredSlot.meeting_mins}m</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Passive Work:</span>
                  <span className="font-semibold text-sky-700">{hoveredSlot.passive_mins}m</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Idle Time:</span>
                  <span className="font-semibold text-amber-700">{hoveredSlot.idle_mins}m</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Input Events:</span>
                  <span className="font-semibold text-slate-800">
                    {hoveredSlot.keyboard_events + hoveredSlot.mouse_events} ({hoveredSlot.keyboard_events}k / {hoveredSlot.mouse_events}m)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
