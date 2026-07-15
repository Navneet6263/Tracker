export function Card({ children, className = "" }) {
  return (
    <div className={`bg-card backdrop-blur-md border border-border rounded-2xl p-5 shadow-xl transition-all duration-300 hover:shadow-brand/10 hover:border-brand/30 animate-fade-in ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub }) {
  return (
    <Card className="flex flex-col gap-1 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-brand/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <span className="text-xs text-slate-400 uppercase tracking-widest relative z-10">{label}</span>
      <span className="text-4xl font-bold text-white relative z-10 bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">{value}</span>
      {sub && <span className="text-xs text-slate-500 relative z-10">{sub}</span>}
    </Card>
  );
}

export function Badge({ type }) {
  const map = {
    productive: "bg-emerald-500/20 text-emerald-400",
    unproductive: "bg-red-500/20 text-red-400",
    neutral: "bg-slate-500/20 text-slate-400",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[type] || map.neutral}`}>
      {type}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
