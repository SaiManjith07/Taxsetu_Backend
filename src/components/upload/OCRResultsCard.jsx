import { Card, CardHeader, CardContent } from '../ui/Card'
import ConfidenceScore from './ConfidenceScore'

export default function OCRResultsCard({ data, confidence_scores }) {
  const scores = confidence_scores || data?.confidence_scores || {}
  const fields = [
    { key: 'invoice_number', label: 'Invoice number', value: data?.invoice_number },
    { key: 'invoice_date', label: 'Invoice date', value: data?.invoice_date },
    { key: 'supplier_name', label: 'Supplier name', value: data?.supplier_name },
    { key: 'supplier_gstin', label: 'Supplier GSTIN', value: data?.supplier_gstin },
    { key: 'taxable_amount', label: 'Taxable amount', value: data?.taxable_amount != null ? `₹${Number(data.taxable_amount).toLocaleString('en-IN')}` : null },
    { key: 'gst_rate', label: 'GST rate %', value: data?.gst_rate != null ? `${data.gst_rate}%` : null },
    { key: 'gst_amount', label: 'GST amount', value: data?.gst_amount != null ? `₹${Number(data.gst_amount).toLocaleString('en-IN')}` : null },
    { key: 'total_amount', label: 'Total amount', value: data?.total_amount != null ? `₹${Number(data.total_amount).toLocaleString('en-IN')}` : null },
  ]
  return (
    <Card>
      <CardHeader title="Extracted data" subtitle="From invoice image (OCR)" />
      <CardContent className="space-y-3">
        {fields.map(({ key, label, value }) => (
          <div key={key}>
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-sm text-text-secondary">{label}</span>
              <span className="font-mono text-text-primary">{value ?? '—'}</span>
            </div>
            {scores[key] != null && <ConfidenceScore score={scores[key]} className="mt-1" />}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
