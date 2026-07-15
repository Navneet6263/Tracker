import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { getEmployeeAnalytics, getScreenshots, getEvents } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { Card, StatCard, Spinner } from "../components/UI";

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa"];

export default function EmployeeDetail() {
  const { id } = useParams();
  const [period, setPeriod] = useState("day");

  const { data: analytics, loading: aLoading } = useFetch(() => getEmployeeAnalytics(id, period), [id, period]);
  const { data: screenshots } = useFetch(() => getScreenshots(id), [id]);
  const { data: events } = useFetch(() => getEvents(id), [id]);

  if (aLoading) return <Spinner />;

  const pieData = analytics?.app_breakdown?.map((a) => ({
    name: a.app.slice(0, 25),
    value: Math.round(a.secs / 60),
  })) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-white flex-1">Employee Detail</h2>
        {["day", "week", "month"].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`text-xs px-3 py-1.5 rounded-lg transition ${period === p ? "bg-brand text-white" : "bg-card border border-border text-slate-400 hover:text-white"}`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Productivity Score" value={`${analytics?.productivity_score ?? 0}%`} />
        <StatCard label="Active Hours" value={`${analytics?.active_hours ?? 0}h`} />
      </div>

      <Card>
        <h3 className="text-white font-semibold mb-4">App Time Breakdown</h3>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => `${v} min`} contentStyle={{ background: "#1e293b", border: "none" }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 text-sm">No data</p>
        )}
      </Card>

      <Card>
        <h3 className="text-white font-semibold mb-4">System Events</h3>
        <ul className="space-y-2 max-h-48 overflow-y-auto">
          {events?.map((e, i) => (
            <li key={i} className="text-sm text-slate-400 flex gap-2">
              <span className="text-slate-600 text-xs">{new Date(e.at).toLocaleTimeString()}</span>
              <span>{e.type.replace(/_/g, " ")}</span>
            </li>
          ))}
          {!events?.length && <li className="text-slate-500 text-sm">No events</li>}
        </ul>
      </Card>

      <Card>
        <h3 className="text-white font-semibold mb-4">Screenshots</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {screenshots?.map((s) => (
            <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="group relative">
              <img
                src={s.url}
                alt={s.window_title}
                className="rounded-xl w-full h-24 object-cover border border-border group-hover:border-brand transition"
              />
              <span className="absolute bottom-1 left-1 right-1 text-xs text-white bg-black/60 rounded px-1 truncate">
                {s.window_title}
              </span>
            </a>
          ))}
          {!screenshots?.length && <p className="text-slate-500 text-sm col-span-4">No screenshots</p>}
        </div>
      </Card>
    </div>
  );
}
