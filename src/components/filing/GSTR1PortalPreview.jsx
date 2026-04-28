import { CheckCircle } from 'lucide-react'

/**
 * Maps gstr1 JSON (from returnsAgent) to portal section counts.
 * Matches official GST portal "ADD RECORD DETAILS" sections.
 */
function getGSTR1SectionCounts(gstr1) {
  if (!gstr1) {
    return {
      b2b_sez_de: 0,
      b2c_large: 0,
      exports: 0,
      b2c_others: 0,
      nil_rated: 0,
      cd_notes_reg: 0,
      cd_notes_unreg: 0,
      advances_tax: 0,
      advances_adj: 0,
      hsn_summary: 0,
      documents_issued: 0,
      eco: 0,
      supplies_9_5: 0,
    }
  }
  const b2bTotal = (gstr1.b2b || []).reduce((s, r) => s + (r.invoice_count || 0), 0)
  const b2cOthersHasValue = Number(gstr1.b2c_others?.taxable_value || 0) > 0
  const docsIssued = gstr1.summary?.total_invoices || 0
  const hsnCount = (gstr1.hsn_summary || []).length

  return {
    b2b_sez_de: b2bTotal,
    b2c_large: 0,
    exports: 0,
    b2c_others: b2cOthersHasValue ? 1 : 0,
    nil_rated: 0,
    cd_notes_reg: 0,
    cd_notes_unreg: 0,
    advances_tax: 0,
    advances_adj: 0,
    hsn_summary: hsnCount,
    documents_issued: docsIssued,
    eco: 0,
    supplies_9_5: 0,
  }
}

const ADD_RECORD_SECTIONS = [
  { key: 'b2b_sez_de', label: '4A, 4B, 6B, 6C - B2B, SEZ, DE Invoices' },
  { key: 'b2c_large', label: '5A - B2C (Large) Invoices' },
  { key: 'exports', label: '6A - Exports Invoices' },
  { key: 'b2c_others', label: '7 - B2C (Others)' },
  { key: 'nil_rated', label: '8A, 8B, 8C, 8D - Nil Rated Supplies' },
  { key: 'cd_notes_reg', label: '9B - Credit / Debit Notes (Registered)' },
  { key: 'cd_notes_unreg', label: '9B - Credit / Debit Notes (Unregistered)' },
  { key: 'advances_tax', label: '11A(1), 11A(2) - Tax Liability (Advances Received)' },
  { key: 'advances_adj', label: '11B(1), 11B(2) - Adjustment of Advances' },
  { key: 'hsn_summary', label: '12 - HSN-wise summary of outward supplies' },
  { key: 'documents_issued', label: '13 - Documents Issued' },
  { key: 'eco', label: '14 - Supplies made through ECO' },
  { key: 'supplies_9_5', label: '15 - Supplies U/s 9(5)' },
]

function formatPeriod(period) {
  if (!period || period.length < 6) return period
  const m = period.slice(0, 2)
  const y = period.slice(2)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parseInt(m, 10) - 1]} ${y}`
}

function getFY(period) {
  if (!period || period.length < 6) return '—'
  const y = period.slice(2)
  const yr = parseInt(y, 10)
  return `${yr - 1}-${String(yr).slice(-2)}`
}

export default function GSTR1PortalPreview({ gstr1, business, period, status = 'Not Filed', dueDateLabel = 'Due Date' }) {
  const counts = getGSTR1SectionCounts(gstr1)
  const periodLabel = period ? formatPeriod(period) : '—'
  const fy = period ? getFY(period) : '—'
  const gstin = business?.gstin || '—'
  const legalName = business?.business_name || business?.legal_name || '—'
  const tradeName = business?.trade_name || 'GSTN'

  return (
    <div className="rounded-xl overflow-hidden border border-white/20 bg-[#0f172a] text-white">
      {/* Teal header - same as portal */}
      <div className="bg-[#0d9488] px-4 py-3">
        <h2 className="text-lg font-semibold">
          GSTR-1 – Details of outward supplies of goods or services
        </h2>
      </div>

      {/* Taxpayer information block */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-4 py-4 bg-white/5 border-b border-white/10">
        <div>
          <p className="text-xs text-cyan-200">GSTIN</p>
          <p className="font-mono text-sm text-white">{gstin}</p>
        </div>
        <div>
          <p className="text-xs text-cyan-200">Legal Name</p>
          <p className="text-sm text-white truncate" title={legalName}>{legalName}</p>
        </div>
        <div>
          <p className="text-xs text-cyan-200">Trade Name</p>
          <p className="text-sm text-white">{tradeName}</p>
        </div>
        <div>
          <p className="text-xs text-cyan-200">FY</p>
          <p className="text-sm text-white">{fy}</p>
        </div>
        <div>
          <p className="text-xs text-cyan-200">Tax Period</p>
          <p className="text-sm text-white">{periodLabel}</p>
        </div>
        <div>
          <p className="text-xs text-cyan-200">Status</p>
          <p className="text-sm text-amber-300">{status}</p>
          {dueDateLabel && (
            <p className="text-xs text-cyan-200 mt-1">{dueDateLabel}</p>
          )}
        </div>
      </div>

      {/* File Nil GSTR-1 */}
      <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
        <input type="checkbox" id="file-nil-gstr1" className="rounded border-white/30" />
        <label htmlFor="file-nil-gstr1" className="text-sm text-text-secondary">File Nil GSTR-1</label>
      </div>

      {/* ADD RECORD DETAILS - blue bar + grid of cards */}
      <div className="border-b border-white/10">
        <div className="bg-[#1e3a5f] px-4 py-2 flex items-center gap-2">
          <span className="text-sm font-medium text-white">ADD RECORD DETAILS</span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {ADD_RECORD_SECTIONS.map(({ key, label }) => (
            <div
              key={key}
              className="rounded-lg overflow-hidden border border-white/10 bg-[#1e293b]"
            >
              <div className="bg-[#1e3a5f] px-3 py-2">
                <p className="text-xs font-medium text-white leading-tight">{label}</p>
              </div>
              <div className="px-3 py-3 flex items-center justify-between">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                <span className="text-lg font-semibold text-white">{counts[key] ?? 0}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* E-invoice advisory */}
      <div className="px-4 py-3 bg-sky-900/20 border-b border-white/10 flex gap-2">
        <span className="text-sky-300">ℹ</span>
        <p className="text-xs text-sky-200">
          The taxpayers for whom e-invoicing is not applicable may ignore the sections/options related to e-invoice download.
          The downloaded file would be blank in case taxpayer is not e-invoicing or when e-invoices reported to IRP are yet to be processed by GST system.
        </p>
      </div>

      {/* Bottom actions - GENERATE SUMMARY etc. */}
      <div className="px-4 py-3 flex flex-wrap gap-2 justify-end">
        <button type="button" className="px-3 py-1.5 rounded border border-white/20 text-sm text-white hover:bg-white/10">
          BACK
        </button>
        <button type="button" className="px-3 py-1.5 rounded bg-[#1e3a5f] text-sm text-white hover:bg-[#2d4a6f]">
          DOWNLOAD DETAILS FROM E-INVOICES (EXCEL)
        </button>
        <button type="button" className="px-3 py-1.5 rounded border border-white/20 text-sm text-white hover:bg-white/10">
          RESET
        </button>
        <button type="button" className="px-3 py-1.5 rounded bg-[#0d9488] text-sm text-white hover:bg-[#0faaa0]">
          GENERATE SUMMARY
        </button>
      </div>
    </div>
  )
}
