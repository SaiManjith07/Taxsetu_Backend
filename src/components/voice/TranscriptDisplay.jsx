export default function TranscriptDisplay({ text }) {
  return (
    <div className="p-4 rounded-lg bg-background border border-white/10 font-mono text-sm text-text-primary whitespace-pre-wrap">
      {text || '—'}
    </div>
  )
}
