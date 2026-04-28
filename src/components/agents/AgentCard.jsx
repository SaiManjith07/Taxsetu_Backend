import { Card, CardHeader, CardContent } from '../ui/Card'

export default function AgentCard({ name, icon, description, status, metrics }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span>{icon}</span> {name}
          </span>
        }
        subtitle={description}
      />
      <CardContent>
        <p className="text-sm">
          <span className="text-text-secondary">Status: </span>
          <span className="text-success">{status}</span>
        </p>
        <ul className="mt-2 space-y-1 text-xs text-text-secondary">
          {metrics?.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
