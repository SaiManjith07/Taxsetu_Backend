export default function ConfidenceScore({ score, label }) {
  const pct = typeof score === 'number' ? score : 0
  const color = pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-danger'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-300`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="text-xs font-mono text-text-secondary w-8">{pct}%</span>
      {label && <span className="text-xs text-text-secondary">{label}</span>}
    </div>
  )
}
