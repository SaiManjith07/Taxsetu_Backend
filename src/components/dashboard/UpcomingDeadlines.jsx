import { Card, CardHeader, CardContent } from '../ui/Card'
import { Calendar } from 'lucide-react'

const deadlines = [
  { type: 'GSTR-3B', due: 'Mar 20, 2025', days: 12, status: 'pending' },
  { type: 'GSTR-1', due: 'Mar 11, 2025', days: 3, status: 'pending' },
  { type: 'TDS', due: 'Apr 7, 2025', days: 30, status: 'scheduled' },
]

export default function UpcomingDeadlines() {
  return (
    <Card>
      <CardHeader title="Upcoming deadlines" subtitle="Next filing due dates" />
      <CardContent>
        <ul className="space-y-3">
          {deadlines.map((d) => (
            <li
              key={d.type}
              className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/20 text-warning">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-text-primary">{d.type}</p>
                  <p className="text-sm text-text-secondary">Due {d.due}</p>
                </div>
              </div>
              <span className="text-sm font-mono text-warning">{d.days} days</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
