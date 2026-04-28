import { useState } from 'react'
import { Card, CardHeader, CardContent } from '../ui/Card'
import Input from '../ui/Input'
import Button from '../ui/Button'

const FIELD_KEYS = [
  'invoice_number',
  'invoice_date',
  'supplier_name',
  'supplier_gstin',
  'taxable_amount',
  'gst_rate',
  'gst_amount',
  'total_amount',
]

const LABELS = {
  invoice_number: 'Invoice number',
  invoice_date: 'Invoice date (YYYY-MM-DD)',
  supplier_name: 'Supplier name',
  supplier_gstin: 'Supplier GSTIN',
  taxable_amount: 'Taxable amount',
  gst_rate: 'GST rate %',
  gst_amount: 'GST amount',
  total_amount: 'Total amount',
}

export default function VerificationInterface({ initialData, onConfirm, onReject }) {
  const [formData, setFormData] = useState(initialData || {})

  const update = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleConfirm = () => {
    onConfirm?.(formData)
  }

  return (
    <Card>
      <CardHeader
        title="Cross-verify & edit"
        subtitle="Correct any field before confirming"
        action={
          <div className="flex gap-2">
            {onReject && (
              <Button variant="outline" size="sm" onClick={onReject}>
                Reject
              </Button>
            )}
            <Button size="sm" onClick={handleConfirm}>
              Confirm & save
            </Button>
          </div>
        }
      />
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELD_KEYS.map((key) => (
            <Input
              key={key}
              label={LABELS[key]}
              value={formData[key] ?? ''}
              onChange={(e) => update(key, e.target.value)}
              type={key.includes('amount') || key === 'gst_rate' ? 'number' : 'text'}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
