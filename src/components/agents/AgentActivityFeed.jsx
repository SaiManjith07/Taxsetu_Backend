import { Card, CardHeader, CardContent } from '../ui/Card'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function AgentActivityFeed({ activities }) {
  const icon = (status) => {
    if (status === 'success') return <CheckCircle className="w-4 h-4 text-success shrink-0" />
    if (status === 'failed') return <XCircle className="w-4 h-4 text-danger shrink-0" />
    return <Loader2 className="w-4 h-4 text-warning animate-spin shrink-0" />
  }
  return (
    <Card>
      <CardHeader title="Activity feed" subtitle="Real-time agent actions" />
      <CardContent>
        <ul className="space-y-2">
          {activities?.map((a, i) => (
            <li key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
              {icon(a.status)}
              <span className="text-text-primary flex-1">{a.agent}: {a.action}</span>
              <span className="text-xs text-text-secondary">{a.time}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
