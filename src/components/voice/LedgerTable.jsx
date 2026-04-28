import { Card, CardHeader, CardContent } from '../ui/Card'

export default function LedgerTable({ entries }) {
  if (!entries?.length) return null
  return (
    <Card>
      <CardHeader title="Ledger entries" subtitle="All entries (voice + manual)" />
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-white/10">
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2 pr-3">Party</th>
                <th className="pb-2 pr-3">GSTIN</th>
                <th className="pb-2 pr-3">Amount</th>
                <th className="pb-2">GST</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-white/5">
                  <td className="py-2 pr-3 text-text-secondary">{e.entry_date || e.date || e.created_at?.slice(0, 10)}</td>
                  <td className="py-2 pr-3 text-text-primary capitalize">{e.transaction_type}</td>
                  <td className="py-2 pr-3 text-text-primary">{e.party_name}</td>
                  <td className="py-2 pr-3 font-mono text-text-secondary text-xs">{e.party_gstin || '—'}</td>
                  <td className="py-2 pr-3 font-mono text-text-primary">₹{Number(e.amount).toLocaleString('en-IN')}</td>
                  <td className="py-2">{e.gst_included ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
