import { Card, CardHeader, CardContent } from '../ui/Card'
import { FileCheck } from 'lucide-react'

const filings = [
  { type: 'GSTR-3B', period: 'Feb 2025', date: 'Mar 5, 2025', status: 'Filed', arn: 'ARN123456789' },
  { type: 'GSTR-1', period: 'Feb 2025', date: 'Mar 1, 2025', status: 'Filed', arn: 'ARN987654321' },
  { type: 'GSTR-3B', period: 'Jan 2025', date: 'Feb 20, 2025', status: 'Filed', arn: 'ARN111222333' },
]

export default function RecentFilings() {
  return (
    <Card>
      <CardHeader title="Recent filings" subtitle="Latest return submissions" />
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-white/10">
                <th className="pb-2 pr-4">Return</th>
                <th className="pb-2 pr-4">Period</th>
                <th className="pb-2 pr-4">Filed on</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filings.map((f) => (
                <tr key={f.arn} className="border-b border-white/5">
                  <td className="py-3 pr-4 font-medium text-text-primary">{f.type}</td>
                  <td className="py-3 pr-4 text-text-secondary">{f.period}</td>
                  <td className="py-3 pr-4 text-text-secondary">{f.date}</td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-1 text-success">
                      <FileCheck className="w-4 h-4" /> {f.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
