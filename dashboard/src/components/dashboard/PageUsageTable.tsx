import React, { useState } from "react";
import { AppWindow, Search, Globe } from "lucide-react";

interface PageItem {
  app: string;
  title: string;
  secs: number;
}

function formatDuration(secs: number) {
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function PageUsageTable({ breakdown }: { breakdown: PageItem[] }) {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = (breakdown || []).filter(
    (item) =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.app.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <Globe className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Window Titles & Visited Pages</h3>
            <p className="text-xs text-slate-500">
              Web browser tabs, documents, and client files accessed during work
            </p>
          </div>
        </div>

        <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full ring-1 ring-slate-200">
          {breakdown?.length || 0} Pages Tracked
        </span>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Filter page titles or tabs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
        />
      </div>

      {!breakdown?.length ? (
        <p className="py-4 text-center text-xs text-slate-400">No page or window activity recorded yet.</p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">No pages match "{searchTerm}".</p>
      ) : (
        <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto pr-1">
          {filtered.map((item, idx) => (
            <div
              key={`${item.app}:${item.title}:${idx}`}
              className="flex items-center gap-4 py-2.5 hover:bg-slate-50/60 rounded-lg px-2 transition-colors"
            >
              <span className="w-32 shrink-0 truncate text-xs font-semibold text-indigo-700 bg-indigo-50/70 px-2 py-0.5 rounded-md">
                {item.app}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-xs text-slate-800 font-medium"
                title={item.title}
              >
                {item.title}
              </span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                {formatDuration(item.secs)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
