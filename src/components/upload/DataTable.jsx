import { Card, CardHeader, CardContent } from '../ui/Card'

export default function DataTable({ rows, validation }) {
  return (
    <Card>
      <CardHeader title="Parsed invoices" subtitle="Review and fix errors before processing" />
      <CardContent>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-white/10">
                <th className="pb-2 pr-3">#</th>
                <th className="pb-2 pr-3">Invoice #</th>
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Supplier</th>
                <th className="pb-2 pr-3">GSTIN</th>
                <th className="pb-2 pr-3">Taxable</th>
                <th className="pb-2 pr-3">GST</th>
                <th className="pb-2 pr-3">Total</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const v = validation[i]
                const isValid = v?.valid
                return (
                  <tr key={i} className={`border-b border-white/5 ${!isValid ? 'bg-danger/5' : ''}`}>
                    <td className="py-2 pr-3 font-mono text-text-secondary">{r._rowIndex}</td>
                    <td className="py-2 pr-3 text-text-primary">{r.invoice_number}</td>
                    <td className="py-2 pr-3 text-text-secondary">{r.invoice_date}</td>
                    <td className="py-2 pr-3 text-text-primary">{r.supplier_name}</td>
                    <td className="py-2 pr-3 font-mono text-text-secondary">{r.supplier_gstin}</td>
                    <td className="py-2 pr-3 text-text-primary">{r.taxable_amount}</td>
                    <td className="py-2 pr-3 text-text-primary">{r.gst_amount}</td>
                    <td className="py-2 pr-3 text-text-primary">{r.total_amount}</td>
                    <td className="py-2">
                      {isValid ? (
                        <span className="text-success">Valid</span>
                      ) : (
                        <span className="text-danger text-xs" title={v?.errors?.join(', ')}>
                          {v?.errors?.length} error(s)
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
