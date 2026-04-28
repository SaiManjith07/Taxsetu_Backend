import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { FileText, Image, FileSpreadsheet, Mic, Loader2, TrendingUp, Receipt, CheckCircle, AlertCircle } from 'lucide-react'
import { ensureNormalizedShape } from '../schema/normalizedInvoice'
import { saveNormalizedInvoice } from '../services/watcherAgent'
import InvoiceExportModal from '../components/invoices/InvoiceExportModal'

const SOURCE_LABELS = {
  photo_upload: { label: 'Photo', icon: Image, color: 'text-primary', bg: 'bg-primary/15' },
  csv_upload: { label: 'CSV', icon: FileSpreadsheet, color: 'text-secondary', bg: 'bg-secondary/15' },
  voice_ledger: { label: 'Voice', icon: Mic, color: 'text-success', bg: 'bg-success/15' },
  voice_entry: { label: 'Voice', icon: Mic, color: 'text-success', bg: 'bg-success/15' },
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return '—'
  const d = timestamp.toDate()
  return d.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
}

function num(v) {
  return Number(v) || 0
}

export default function InvoicesPage() {
  const { user, business } = useAuth()
  const businessIdVal = user?.uid
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'purchase' | 'sale'
  const [saleBase, setSaleBase] = useState(null)
  const [saleForm, setSaleForm] = useState({
    customer_name: '',
    customer_gstin: '',
    sale_date: new Date().toISOString().slice(0, 10),
    sale_amount: '',
    gst_included: true,
  })
  const [savingSale, setSavingSale] = useState(false)
  const [saleError, setSaleError] = useState('')
  const [exportInvoice, setExportInvoice] = useState(null)

  useEffect(() => {
    if (!businessIdVal || businessIdVal === 'demo') {
      setInvoices([])
      setLoading(false)
      return
    }
    let cancelled = false
    const load = () => {
    setLoading(true)
    setError('')
    const q = query(
      collection(db, 'invoices'),
      where('business_id', '==', businessIdVal),
      orderBy('created_at', 'desc')
    )
    getDocs(q)
      .then((snap) => {
        if (cancelled) return
        setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load invoices')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    }
    load()
    return () => { cancelled = true }
  }, [businessIdVal])

  const sourceInfo = (source) => SOURCE_LABELS[source] || { label: source || '—', icon: FileText, color: 'text-text-secondary', bg: 'bg-white/5' }

  const filtered = invoices.filter((inv) => {
    const txType = inv.metadata?.transaction_type || inv.transaction_type || 'purchase'
    if (typeFilter === 'sale') return txType === 'sale'
    if (typeFilter === 'purchase') return txType !== 'sale'
    return true
  })

  const totals = filtered.reduce(
    (acc, inv) => ({
      count: acc.count + 1,
      taxable: acc.taxable + num(inv.taxable_amount),
      gst: acc.gst + num(inv.gst_amount),
      total: acc.total + num(inv.total_amount),
      itcEligibleCount: acc.itcEligibleCount + (inv.itc_eligible ? 1 : 0),
      itcAmount: acc.itcAmount + num(inv.itc_amount),
    }),
    { count: 0, taxable: 0, gst: 0, total: 0, itcEligibleCount: 0, itcAmount: 0 }
  )

  const openSaleForInvoice = (inv) => {
    setSaleBase(inv)
    setSaleError('')
    setSaleForm({
      customer_name: '',
      customer_gstin: '',
      sale_date: new Date().toISOString().slice(0, 10),
      sale_amount: '',
      gst_included: true,
    })
  }

  const handleSaleFormChange = (field, value) => {
    setSaleForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreateSaleInvoice = async () => {
    if (!businessIdVal || !saleBase) return
    const amountNum = Number(saleForm.sale_amount)
    if (!amountNum || amountNum <= 0) {
      setSaleError('Enter a valid sale amount.')
      return
    }
    const rate = Number(saleBase.gst_rate) || 0
    const gstIncluded = saleForm.gst_included
    let taxable = amountNum
    let gstAmt = 0
    if (rate > 0) {
      if (gstIncluded) {
        taxable = Math.round((amountNum / (1 + rate / 100)) * 100) / 100
        gstAmt = amountNum - taxable
      } else {
        taxable = amountNum
        gstAmt = Math.round(amountNum * (rate / 100) * 100) / 100
      }
    }
    const total = gstIncluded || rate === 0 ? amountNum : taxable + gstAmt
    const saleDate = saleForm.sale_date ? new Date(saleForm.sale_date) : new Date()
    const normalized = ensureNormalizedShape({
      invoice_number: `SALE-${saleBase.invoice_number || saleBase.id}`,
      invoice_date: saleDate,
      supplier_name: saleForm.customer_name || 'Customer',
      supplier_gstin: (saleForm.customer_gstin || '').trim(),
      taxable_amount: taxable,
      gst_rate: rate,
      gst_amount: gstAmt,
      total_amount: total,
      source: 'manual_sale',
      metadata: {
        transaction_type: 'sale',
        linked_purchase_invoice_id: saleBase.id,
        purchase_invoice_number: saleBase.invoice_number,
        purchase_supplier_name: saleBase.supplier_name,
        gst_included: gstIncluded,
      },
    })
    setSavingSale(true)
    setSaleError('')
    try {
      await saveNormalizedInvoice(businessIdVal, normalized, { confidence_score: 100 })
      setSaleBase(null)
      // Reload invoices so the new sale invoice appears immediately
      const q = query(
        collection(db, 'invoices'),
        where('business_id', '==', businessIdVal),
        orderBy('created_at', 'desc')
      )
      const snap = await getDocs(q)
      setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (e) {
      setSaleError(e.message || 'Failed to create sale invoice')
    } finally {
      setSavingSale(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">All invoices</h1>
        <p className="text-text-secondary mt-1">
          Everything you’ve added — totals, Watcher/Calculator status, and mode.
        </p>
      </div>

      {businessIdVal === 'demo' && (
        <Card className="border-amber-500/30">
          <CardContent className="py-4">
            <p className="text-amber-400 text-sm">
              You’re in demo mode. Sign in to see invoices saved to your account.
            </p>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}

      {!loading && !error && businessIdVal && businessIdVal !== 'demo' && invoices.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20 text-primary">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Invoices</p>
                <p className="text-lg font-bold text-text-primary">{totals.count}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/10 text-text-primary">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Sum Taxable</p>
                <p className="text-lg font-bold text-text-primary">₹{totals.taxable.toLocaleString('en-IN')}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/20 text-warning">
                <span className="text-sm font-semibold">GST</span>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Sum GST</p>
                <p className="text-lg font-bold text-text-primary">₹{totals.gst.toLocaleString('en-IN')}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/20 text-success">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Sum Total</p>
                <p className="text-lg font-bold text-text-primary">₹{totals.total.toLocaleString('en-IN')}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/20 text-success">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">ITC eligible</p>
                <p className="text-lg font-bold text-text-primary">{totals.itcEligibleCount} / {totals.count}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/20 text-secondary">
                <span className="text-sm font-semibold">ITC</span>
              </div>
              <div>
                <p className="text-xs text-text-secondary">ITC amount</p>
                <p className="text-lg font-bold text-text-primary">₹{totals.itcAmount.toLocaleString('en-IN')}</p>
              </div>
            </Card>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-secondary">
              Showing <span className="font-semibold text-text-primary">{filtered.length}</span> of{' '}
              <span className="font-semibold text-text-primary">{invoices.length}</span> invoices
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">Filter by type:</span>
              <div className="inline-flex rounded-lg overflow-hidden border border-white/15">
                <button
                  type="button"
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1 text-xs font-medium ${
                    typeFilter === 'all' ? 'bg-primary text-white' : 'bg-transparent text-text-secondary'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('purchase')}
                  className={`px-3 py-1 text-xs font-medium border-l border-white/15 ${
                    typeFilter === 'purchase' ? 'bg-primary text-white' : 'bg-transparent text-text-secondary'
                  }`}
                >
                  Purchases
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('sale')}
                  className={`px-3 py-1 text-xs font-medium border-l border-white/15 ${
                    typeFilter === 'sale' ? 'bg-primary text-white' : 'bg-transparent text-text-secondary'
                  }`}
                >
                  Sales
                </button>
              </div>
            </div>
          </div>

        <Card>
          <CardHeader
            title="Saved invoices"
              subtitle={`${invoices.length} invoice(s) — newest first. Click a row to see details.`}
          />
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-secondary border-b border-white/10 bg-white/5">
                      <th className="py-3 px-4 whitespace-nowrap font-medium">Saved at</th>
                      <th className="py-3 px-4 whitespace-nowrap font-medium">Mode</th>
                      <th className="py-3 px-4 font-medium">Invoice #</th>
                      <th className="py-3 px-4 font-medium">Date</th>
                      <th className="py-3 px-4 font-medium">Type</th>
                      <th className="py-3 px-4 font-medium">Supplier</th>
                      <th className="py-3 px-4 font-medium">GSTIN</th>
                      <th className="py-3 px-4 text-right font-medium">Taxable</th>
                      <th className="py-3 px-4 text-right font-medium">GST</th>
                      <th className="py-3 px-4 text-right font-medium">Total</th>
                      <th className="py-3 px-4 font-medium">Watcher</th>
                      <th className="py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((inv) => {
                      const src = sourceInfo(inv.source)
                      const Icon = src.icon
                      const created = inv.created_at || inv.metadata?.created_at
                      const invDate = inv.invoice_date?.toDate
                        ? inv.invoice_date.toDate().toLocaleDateString('en-IN')
                        : inv.invoice_date
                          ? String(inv.invoice_date).slice(0, 10)
                          : '—'
                      const processed = inv.processed_by_calculator === true
                      const itcEligible = inv.itc_eligible === true
                      const txType = inv.metadata?.transaction_type || inv.transaction_type || 'purchase'
                      return (
                        <tr
                          key={inv.id}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <td className="py-3 px-4 text-text-secondary whitespace-nowrap">
                            {formatDate(created)}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${src.bg} ${src.color} font-medium`}>
                              <Icon className="w-4 h-4" /> {src.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-text-primary">{inv.invoice_number || '—'}</td>
                          <td className="py-3 px-4 text-text-secondary">{invDate}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                                txType === 'sale' ? 'bg-orange-500/15 text-orange-300' : 'bg-emerald-500/15 text-emerald-300'
                              }`}
                            >
                              {txType === 'sale' ? 'Sale' : 'Purchase'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-text-primary max-w-[120px] truncate" title={inv.supplier_name}>{inv.supplier_name || '—'}</td>
                          <td className="py-3 px-4 font-mono text-text-secondary text-xs">{inv.supplier_gstin || '—'}</td>
                          <td className="py-3 px-4 text-right font-mono text-text-primary">
                            {inv.taxable_amount != null ? `₹${num(inv.taxable_amount).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-text-primary">
                            {inv.gst_amount != null ? `₹${num(inv.gst_amount).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium text-text-primary">
                            {inv.total_amount != null ? `₹${num(inv.total_amount).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-0.5">
                              {processed && (
                                <span className="inline-flex items-center gap-1 text-xs text-success">
                                  <CheckCircle className="w-3.5 h-3.5" /> Calc
                                </span>
                              )}
                              {inv.itc_eligible === true && (
                                <span className="text-xs text-success">ITC ✓</span>
                              )}
                              {inv.itc_eligible === false && inv.processed_by_calculator && (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                                  <AlertCircle className="w-3.5 h-3.5" /> No ITC
                                </span>
                              )}
                              {!processed && <span className="text-xs text-text-secondary">—</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {txType !== 'sale' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openSaleForInvoice(inv)}
                              >
                                Add sale details
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setExportInvoice(inv)}
                              >
                                Invoice / Export
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-primary/30 bg-primary/5 text-text-primary font-semibold">
                      <td className="py-3 px-4" colSpan={6}>
                        Total ({totals.count} invoices)
                      </td>
                      <td className="py-3 px-4 text-right font-mono">₹{totals.taxable.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 text-right font-mono">₹{totals.gst.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 text-right font-mono">₹{totals.total.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {saleBase && (
            <Card className="mt-4 border-orange-500/40 bg-orange-500/5">
              <CardHeader
                title="Add sale details"
                subtitle={`Create a sale invoice linked to purchase #${saleBase.invoice_number || saleBase.id}.`}
              />
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Customer name"
                    placeholder="Customer / buyer name"
                    value={saleForm.customer_name}
                    onChange={(e) => handleSaleFormChange('customer_name', e.target.value)}
                  />
                  <Input
                    label="Customer GSTIN (optional)"
                    placeholder="15 characters"
                    maxLength={15}
                    value={saleForm.customer_gstin}
                    onChange={(e) => handleSaleFormChange('customer_gstin', e.target.value.toUpperCase())}
                  />
                  <Input
                    label="Sale date"
                    type="date"
                    value={saleForm.sale_date}
                    onChange={(e) => handleSaleFormChange('sale_date', e.target.value)}
                  />
                  <Input
                    label="Sale amount (₹)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={saleForm.sale_amount}
                    onChange={(e) => handleSaleFormChange('sale_amount', e.target.value)}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-white/30 bg-background text-primary focus:ring-primary"
                      checked={saleForm.gst_included}
                      onChange={(e) => handleSaleFormChange('gst_included', e.target.checked)}
                    />
                    <span className="text-sm text-text-secondary">
                      GST included in sale amount (rate {Number(saleBase.gst_rate) || 0}%)
                    </span>
                  </label>
                </div>
                {saleError && <p className="text-sm text-danger">{saleError}</p>}
                <div className="flex flex-wrap gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setSaleBase(null)}
                    disabled={savingSale}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleCreateSaleInvoice}
                    disabled={savingSale}
                  >
                    {savingSale ? 'Saving…' : 'Generate sale invoice'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!loading && !error && businessIdVal && businessIdVal !== 'demo' && invoices.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="w-12 h-12 mx-auto text-text-secondary/50 mb-3" />
            <p className="text-text-secondary">
              No invoices yet. Add some via Photo upload, CSV / Excel, or Voice ledger.
            </p>
          </CardContent>
        </Card>
      )}
      {exportInvoice && (
        <InvoiceExportModal
          invoice={exportInvoice}
          business={business}
          onClose={() => setExportInvoice(null)}
        />
      )}
    </div>
  )
}
