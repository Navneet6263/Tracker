import React, { useState } from "react";
import { Laptop, Search, ShieldCheck, Filter } from "lucide-react";
import type { AppBreakdownItem } from "@/lib/api";

const COLORS: Record<string, string> = {
  Gmail: "bg-red-500",
  YouTube: "bg-rose-500",
  WhatsApp: "bg-emerald-500",
  Chrome: "bg-blue-500",
  "Google Chrome": "bg-blue-500",
  Edge: "bg-indigo-500",
  "Microsoft Edge": "bg-indigo-500",
  Firefox: "bg-orange-500",
  "Mozilla Firefox": "bg-orange-500",
  "VS Code": "bg-violet-500",
  "Visual Studio Code": "bg-violet-500",
  Code: "bg-violet-500",
  "MS Teams": "bg-purple-500",
  "Microsoft Teams": "bg-purple-500",
  Slack: "bg-amber-500",
  Zoom: "bg-sky-500",
  Excel: "bg-green-600",
  Word: "bg-blue-600",
  Outlook: "bg-blue-700",
  Notion: "bg-slate-700",
  Figma: "bg-pink-500",
  Spotify: "bg-emerald-600",
  Netflix: "bg-red-600",
};

function getColor(app: string) {
  return COLORS[app] ?? "bg-indigo-500";
}

function fmtTime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface Props {
  breakdown: AppBreakdownItem[];
  keyboardMins: number;
  mouseMins: number;
}

export function AppUsageDetail({ breakdown, keyboardMins, mouseMins }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"all" | "productive" | "neutral" | "unproductive">("all");

  if (!breakdown || breakdown.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">App Usage Breakdown</h3>
        <p className="text-xs text-slate-400">No application activity recorded for this period.</p>
      </div>
    );
  }

  const maxSecs = breakdown[0]?.secs ?? 1;

  const filtered = breakdown.filter((item) => {
    const matchesSearch = item.app.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <Laptop className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Application Usage Analytics</h3>
            <p className="text-xs text-slate-500">Tracked software, productivity tags, and duration</p>
          </div>
        </div>

        {/* Input pulse chips */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">
            <span>⌨️</span>
            <span className="font-semibold text-slate-800">{Math.round(keyboardMins)}m</span>
            <span className="text-slate-400">typing</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">
            <span>🖱️</span>
            <span className="font-semibold text-slate-800">{Math.round(mouseMins)}m</span>
            <span className="text-slate-400">mouse active</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search applications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(["all", "productive", "neutral", "unproductive"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                selectedCategory === cat
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* App list bars */}
      <div className="space-y-3 pt-2">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">No applications match your filter.</p>
        ) : (
          filtered.map((item) => {
            const pct = Math.max(3, (item.secs / maxSecs) * 100);
            const color = getColor(item.app);
            return (
              <div key={item.app} className="flex items-center gap-3">
                <div className="w-32 shrink-0 truncate text-xs font-semibold text-slate-800 text-right">
                  {item.app}
                </div>

                <div className="relative flex-1 h-5 rounded-full bg-slate-100 overflow-hidden ring-1 ring-slate-200/50">
                  <div
                    className={`h-full rounded-full ${color} transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                  />
                  {item.percentage !== undefined && item.percentage > 10 && (
                    <span className="absolute inset-y-0 left-2.5 flex items-center text-[10px] font-bold text-white drop-shadow-xs">
                      {item.percentage}%
                    </span>
                  )}
                </div>

                <div className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-700 font-bold">
                  {fmtTime(item.secs)}
                </div>

                <span
                  className={`w-20 shrink-0 text-center rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                    item.category === "productive"
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60"
                      : item.category === "unproductive"
                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200/60"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {item.category}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
