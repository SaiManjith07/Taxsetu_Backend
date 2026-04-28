import { Card, CardHeader, CardContent } from '../ui/Card'

export default function MasterPlannerCard({ status, tasksPlanned, autoExecuted }) {
  const rate = tasksPlanned ? Math.round((autoExecuted / tasksPlanned) * 100) : 0
  return (
    <Card className="border-primary/30">
      <CardHeader
        title={<span className="flex items-center gap-2">🧠 MASTER PLANNER</span>}
        subtitle="Orchestrates all agents and decisions"
      />
      <CardContent className="flex flex-wrap gap-6">
        <div>
          <p className="text-sm text-text-secondary">Status</p>
          <p className="text-success font-medium">{status}</p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">Tasks planned</p>
          <p className="font-mono text-text-primary">{tasksPlanned}</p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">Auto-executed</p>
          <p className="font-mono text-text-primary">{autoExecuted}</p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">Success rate</p>
          <p className="font-mono text-primary">{rate}%</p>
        </div>
      </CardContent>
    </Card>
  )
}
