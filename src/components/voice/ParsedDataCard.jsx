import { Card, CardHeader, CardContent } from '../ui/Card'

export default function ParsedDataCard({ data }) {
  const rows = [
    { label: 'Transaction type', value: data?.transaction_type },
    { label: 'Party name', value: data?.party_name },
    { label: 'Party GSTIN', value: data?.party_gstin || '—' },
    { label: 'Amount', value: data?.amount != null ? `₹${Number(data.amount).toLocaleString('en-IN')}` : null },
    { label: 'GST included', value: data?.gst_included != null ? (data.gst_included ? 'Yes' : 'No') : null },
    { label: 'Date', value: data?.date },
    { label: 'Description', value: data?.description },
  ]
  return (
    <Card>
      <CardHeader title="Parsed data" subtitle="Structured from your voice" />
      <CardContent>
        <dl className="space-y-2">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-2">
              <dt className="text-text-secondary">{label}</dt>
              <dd className="font-mono text-text-primary">{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {data?.clarification_needed?.length > 0 && (
          <p className="mt-3 text-sm text-warning">Clarification needed: {data.clarification_needed.join(', ')}</p>
        )}
      </CardContent>
    </Card>
  )
}
