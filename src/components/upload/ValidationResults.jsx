import { Card } from '../ui/Card'
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'

export default function ValidationResults({ validCount, invalidCount, total }) {
  return (
    <Card className="flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-5 h-5 text-success" />
        <span className="text-text-primary font-medium">{validCount} valid</span>
      </div>
      <div className="flex items-center gap-2">
        <XCircle className="w-5 h-5 text-danger" />
        <span className="text-text-primary font-medium">{invalidCount} invalid</span>
      </div>
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-text-secondary" />
        <span className="text-text-secondary">{total} total rows</span>
      </div>
    </Card>
  )
}
