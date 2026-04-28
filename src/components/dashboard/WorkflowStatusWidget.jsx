import { useEffect, useState } from 'react'
import { Card, CardContent } from '../ui/Card'
import { Loader2 } from 'lucide-react'
import * as masterPlannerAgent from '../../services/masterPlannerAgent'

export default function WorkflowStatusWidget({ businessId }) {
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!businessId) {
      setWorkflows([])
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const list = await masterPlannerAgent.getActiveWorkflows(businessId)
        if (!cancelled) setWorkflows(Array.isArray(list) ? list : [])
      } catch (_) {
        if (!cancelled) setWorkflows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [businessId])

  if (loading || workflows.length === 0) return null

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-4">
        <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          AI Working...
        </h3>
        <div className="space-y-3">
          {workflows.map((wf) => (
            <div key={wf.execution_id} className="rounded-lg bg-background/80 p-3 border border-border">
              <div className="font-medium text-text-primary text-sm">{wf.workflow_name}</div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, ((wf.current_step || 0) / (wf.total_steps || 1)) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-text-secondary">
                <span>
                  Step {wf.current_step || 0}/{wf.total_steps || 0}
                </span>
                {wf.status === 'awaiting_user' && (
                  <span className="text-amber-600 font-medium">Waiting for you</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
