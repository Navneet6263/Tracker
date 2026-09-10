import { useEffect, useState } from "react";
import { fetchWorkDeclines, type WorkDecline } from "@/lib/api";

export function WorkDeclines() {
  const [rows, setRows] = useState<WorkDecline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => fetchWorkDeclines()
      .then((data) => { if (alive) { setRows(data); setError(false); } })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    void load();
    const timer = window.setInterval(load, 30000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-sm font-semibold">Admin requests: work not started</h2>
    <p className="mt-1 text-xs text-slate-500">Latest 100 submitted reasons. Each entry describes that sign-in attempt, not the employee's current status. Refreshes every 30 seconds.</p>
    {loading ? <p className="mt-3 text-sm">Loading requests...</p> : error ?
      <p className="mt-3 text-sm text-rose-600" role="alert">Could not load requests. Retrying automatically.</p> :
      rows.length === 0 ? <p className="mt-3 text-sm text-slate-500">No reasons submitted.</p> :
      <div className="mt-3 overflow-auto"><table className="w-full text-left text-sm">
        <thead><tr><th>Verified account</th><th>Computer</th><th>Submitted</th><th>Reason</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100 align-top">
          <td className="p-2"><a href={`/employees/${row.employee_id}`} className="text-indigo-600 hover:underline">{row.employee_name} (#{row.employee_id})</a></td>
          <td className="p-2">{row.device_name}</td>
          <td className="p-2">{new Date(row.created_at).toLocaleString()}</td>
          <td className="min-w-48 max-w-lg whitespace-pre-wrap break-words p-2">{row.reason}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}
