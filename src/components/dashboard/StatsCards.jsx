import { useData } from '../../contexts/DataContext'
import { Card } from '../ui/Card'
import { TrendingUp, IndianRupee, FileCheck, Calendar } from 'lucide-react'

const cards = [
  {
    key: 'compliance',
    label: 'Compliance Score',
    value: (d) => `${d.complianceScore}%`,
    icon: TrendingUp,
    color: 'text-success',
    bg: 'bg-success/20',
  },
  {
    key: 'taxSaved',
    label: 'Tax Saved (YTD)',
    value: (d) => `₹${d.taxSaved?.toLocaleString('en-IN') || '0'}`,
    icon: IndianRupee,
    color: 'text-primary',
    bg: 'bg-primary/20',
  },
  {
    key: 'returns',
    label: 'Returns Filed',
    value: (d) => `${d.returnsFiled?.filed || 0}/${d.returnsFiled?.total || 0}`,
    icon: FileCheck,
    color: 'text-secondary',
    bg: 'bg-secondary/20',
  },
  {
    key: 'deadline',
    label: 'Next Deadline',
    value: () => '12 days',
    icon: Calendar,
    color: 'text-warning',
    bg: 'bg-warning/20',
  },
]

export default function StatsCards() {
  const data = useData()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ key, label, value, icon: Icon, color, bg }) => (
        <Card key={key} className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${bg} ${color}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-text-secondary">{label}</p>
            <p className="text-xl font-bold text-text-primary">{value(data)}</p>
          </div>
        </Card>
      ))}
    </div>
  )
}
