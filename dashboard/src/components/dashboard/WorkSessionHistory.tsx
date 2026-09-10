import { useEffect, useState } from "react";
import { fetchWorkSessions, type WorkSessionHistory as Session } from "@/lib/api";

export function WorkSessionHistory({ employeeId }: { employeeId: number }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = () => fetchWorkSessions(employeeId)
      .then((rows) => { if (alive) { setSessions(rows); setError(false); } })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    setLoading(true);
    void load();
    const timer = window.setInterval(load, 30000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [employeeId]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-sm font-semibold">Computer and work-session history</h2>
    <p className="mt-1 text-xs text-slate-500">Latest 100 sessions. Times shown in your local timezone.</p>
    {loading ? <p>Loading sessions…</p> : error ? <p>Could not load session history.</p> : sessions.length === 0 ?
      <p className="mt-3 text-sm text-slate-500">No verified work sessions yet. Earlier Windows-profile records remain in activity reports.</p> :
      <div className="mt-3 overflow-auto"><table className="w-full text-left text-sm">
        <thead><tr><th>Computer</th><th>Started</th><th>Ended</th></tr></thead>
        <tbody>{sessions.map((s) => <tr key={s.id} className="border-t border-slate-100">
          <td className="py-2">{s.device_name}</td>
          <td>{new Date(s.started_at).toLocaleString()}</td>
          <td>{s.ended_at ? new Date(s.ended_at).toLocaleString() : "Session open"}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}
