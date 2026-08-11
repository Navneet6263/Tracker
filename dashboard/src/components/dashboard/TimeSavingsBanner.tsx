import { BriefcaseBusiness, Headphones } from "lucide-react";

import type { EmployeeSummary } from "@/lib/api";

interface Props {
  employees: EmployeeSummary[];
}

export function TimeSavingsBanner({ employees }: Props) {
  const verifiedHours = employees.reduce((total, employee) => total + employee.active_hours, 0);
  const meetingHours = employees.reduce((total, employee) => total + employee.meeting_hours, 0);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-indigo-600">
          <BriefcaseBusiness className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-indigo-900">
            {verifiedHours.toFixed(1)} verified work hours today
          </p>
          <p className="text-xs text-indigo-600/80">
            Calculated from app activity, calls, input, idle and lock states—without screenshots.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow-sm ring-1 ring-indigo-100">
        <Headphones className="h-4 w-4 text-violet-600" />
        <div>
          <p className="text-xs text-slate-500">VoIP/client calls</p>
          <p className="text-lg font-bold leading-tight text-violet-700">
            {meetingHours.toFixed(1)}h
          </p>
        </div>
      </div>
    </div>
  );
}
