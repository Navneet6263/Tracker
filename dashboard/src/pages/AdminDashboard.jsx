import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getSummary } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useAuth } from "../hooks/useAuth";
import { StatCard, Card, Spinner } from "../components/UI";

export default function AdminDashboard() {
  const { data: initialData, loading } = useFetch(getSummary);
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [employees, setEmployees] = useState([]);
  const [activeIds, setActiveIds] = useState(new Set());

  useEffect(() => {
    if (initialData) setEmployees(initialData);
  }, [initialData]);

  useEffect(() => {
    if (!user?.id) return;
    const ws = new WebSocket(`ws://localhost:8000/ws/${user.id}`);
    
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "ping" || msg.type === "screenshot" || msg.type === "event") {
          setActiveIds((prev) => new Set(prev).add(msg.employee_id));
          
          if (msg.inputs) {
            window.__live_inputs = window.__live_inputs || {};
            window.__live_inputs[msg.employee_id] = msg.inputs;
          }

          setTimeout(() => {
            setActiveIds((prev) => {
              const next = new Set(prev);
              next.delete(msg.employee_id);
              return next;
            });
            if (window.__live_inputs && window.__live_inputs[msg.employee_id]) {
              window.__live_inputs[msg.employee_id].keyboard = false;
              window.__live_inputs[msg.employee_id].mouse = false;
            }
          }, 60000);
        }
      } catch (err) {}
    };

    return () => ws.close();
  }, [user?.id]);

  if (loading) return <Spinner />;

  const active = Math.max(
    employees?.filter((e) => e.active_hours > 0).length ?? 0,
    activeIds.size
  );
  
  const avgScore = employees?.length
    ? Math.round(employees.reduce((s, e) => s + e.productivity_score, 0) / employees.length)
    : 0;
  const totalHours = employees?.reduce((s, e) => s + e.active_hours, 0).toFixed(1) ?? 0;

  const chartData = employees?.map(e => ({
    name: e.name.split(' ')[0],
    hours: e.active_hours
  })) || [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-white">Executive Summary</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Active Employees" value={active} sub="right now" />
        <StatCard label="Avg Productivity" value={`${avgScore}%`} sub="today" />
        <StatCard label="Total Active Hours" value={totalHours} sub="today" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-white font-semibold mb-4">Employee Overview</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-300">
              <thead>
                <tr className="text-slate-500 text-xs uppercase border-b border-border">
                  <th className="text-left py-2 pr-4">Name</th>
                  <th className="text-left py-2 pr-4">Active Hrs</th>
                  <th className="text-left py-2 pr-4">Score</th>
                  <th className="text-left py-2 pr-4">Inputs (Live)</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {employees?.map((emp) => {
                  const isActive = activeIds.has(emp.id) || emp.active_hours > 0;
                  const inputs = window.__live_inputs?.[emp.id] || { keyboard: false, mouse: false, win_r_count: 0 };
                  
                  return (
                    <tr
                      key={emp.id}
                      onClick={() => navigate(`/admin/employee/${emp.id}`)}
                      className="border-b border-border/50 hover:bg-white/5 cursor-pointer transition group"
                    >
                      <td className="py-4 pr-4 font-medium text-white group-hover:text-brand-light transition">{emp.name}</td>
                      <td className="py-4 pr-4">{emp.active_hours}h</td>
                      <td className="py-4 pr-4">
                        <span className={`font-semibold ${emp.productivity_score >= 60 ? "text-emerald-400" : "text-red-400"}`}>
                          {emp.productivity_score}%
                        </span>
                      </td>
                      <td className="py-4 pr-4 flex gap-2 items-center">
                        <span className={inputs.keyboard ? "text-emerald-400" : "text-slate-500"} title="Keyboard Activity">⌨️</span>
                        <span className={inputs.mouse ? "text-emerald-400" : "text-slate-500"} title="Mouse Activity">🖱️</span>
                        {inputs.win_r_count > 0 && <span className="text-red-400 text-xs bg-red-900/30 px-1 rounded" title="Win+R presses">Win+R: {inputs.win_r_count}</span>}
                      </td>
                      <td className="py-4">
                        {isActive ? (
                          <span className="flex items-center gap-2 text-emerald-400 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-slow"></span>
                            Active
                          </span>
                        ) : (
                          <span className="text-slate-500">Offline</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h3 className="text-white font-semibold mb-4">Time Distribution</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{fill: 'rgba(255,255,255,0.05)'}}
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                />
                <Bar dataKey="hours" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm">No data</p>
          )}
        </Card>
      </div>
    </div>
  );
}
