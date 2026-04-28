import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import Button from '../components/ui/Button'
import GSTR1PortalPreview from '../components/filing/GSTR1PortalPreview'
import {
  computeNetTax,
  generateGSTR3B,
  validateCompliance,
} from '../services/calculatorAgent'
import { generateGSTR1 } from '../services/returnsAgent'
import { exportGSTR1CSV, exportGSTR3BCSV } from '../services/calculatorExport'
import { TrendingUp, TrendingDown, IndianRupee, FileText, Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Download } from 'lucide-react'

function getCurrentPeriod() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const y = d.getFullYear()
  return `${m}${y}`
}

function formatPeriod(period) {
  if (!period || period.length < 6) return period
  const m = period.slice(0, 2)
  const y = period.slice(2)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m, 10) - 1]} ${y}`
}

export default function CalculatorDashboard() {
  const { user, business } = useAuth()
  const businessId = user?.uid
  const navigate = useNavigate()
  const period = getCurrentPeriod()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)
  const [gstr1, setGstr1] = useState(null)
  const [gstr3b, setGstr3b] = useState(null)
  const [validation, setValidation] = useState(null)
  const [stepsOpen, setStepsOpen] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(true)
  const [gstr1PreviewOpen, setGstr1PreviewOpen] = useState(true)
  const [exporting, setExporting] = useState(null)

  const handleDownloadCSV = async (type) => {
    if (!businessId || businessId === 'demo') return
    setExporting(type)
    try {
      const fn = type === 'GSTR-1' ? exportGSTR1CSV : exportGSTR3BCSV
      const bytes = await fn(businessId, period)
      const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `TaxMitra_${type}_${period}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.warn('Export failed:', e)
    } finally {
      setExporting(null)
    }
  }

  useEffect(() => {
    if (!businessId || businessId === 'demo') {
      setSummary({
        period,
        outward_taxable: 0,
        outward_cgst: 0,
        outward_sgst: 0,
        output_tax: 0,
        itc_cgst: 0,
        itc_sgst: 0,
        itc_total: 0,
        net_cgst: 0,
        net_sgst: 0,
        net_payable: 0,
      })
      setGstr1(null)
      setGstr3b(null)
      setValidation({ pass: true, warnings: [] })
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const [net, g1, g3b] = await Promise.all([
          computeNetTax(businessId, period),
          generateGSTR1(businessId, period),
          generateGSTR3B(businessId, period),
        ])
        if (cancelled) return
        setSummary(net)
        setGstr1(g1)
        setGstr3b(g3b)
        const val = await validateCompliance(g3b)
        if (cancelled) return
        setValidation(val)
      } catch (e) {
        if (!cancelled) setSummary(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [businessId, period])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const s = summary || {}

  const stats = [
    { label: 'Outward (Sales) ₹', value: s.outward_taxable ?? 0, sub: `Tax: ₹${(s.output_tax ?? 0).toLocaleString('en-IN')}`, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/20' },
    { label: 'ITC Available ₹', value: s.itc_total ?? 0, sub: 'Eligible credit', icon: IndianRupee, color: 'text-success', bg: 'bg-success/20' },
    { label: 'Net Payable ₹', value: s.net_payable ?? 0, sub: 'CGST + SGST', icon: TrendingDown, color: 'text-warning', bg: 'bg-warning/20' },
    { label: 'Return', value: formatPeriod(period), sub: 'GSTR-3B', icon: FileText, color: 'text-secondary', bg: 'bg-secondary/20' },
  ]

  const itcUtilized = s.itc_utilized ?? (s.itc_cgst_used ?? 0) + (s.itc_sgst_used ?? 0) + (s.itc_igst_used ?? 0)
  const itcCarried = s.itc_carried_forward ?? 0
  const openingTotal = (s.itc_opening_cgst ?? 0) + (s.itc_opening_sgst ?? 0) + (s.itc_opening_igst ?? 0)
  const outIgst = (s.outward_igst ?? 0) > 0 ? ` + IGST ₹${(s.outward_igst ?? 0).toLocaleString('en-IN')}` : ''
  const calculationSteps = [
    { title: 'Output tax (outward supplies)', expr: `CGST ₹${(s.outward_cgst ?? 0).toLocaleString('en-IN')} + SGST ₹${(s.outward_sgst ?? 0).toLocaleString('en-IN')}${outIgst} = ₹${(s.output_tax ?? 0).toLocaleString('en-IN')}` },
    { title: 'ITC available (eligible credit)', expr: `CGST ₹${(s.itc_cgst ?? 0).toLocaleString('en-IN')} + SGST ₹${(s.itc_sgst ?? 0).toLocaleString('en-IN')}${(s.itc_igst ?? 0) ? ` + IGST ₹${(s.itc_igst ?? 0).toLocaleString('en-IN')}` : ''} = ₹${(s.itc_total ?? 0).toLocaleString('en-IN')}${openingTotal > 0 ? ` (includes opening ₹${openingTotal.toLocaleString('en-IN')})` : ''}` },
    { title: 'ITC utilized (this return)', expr: `Applied only against applicable output (CGST→CGST/IGST, SGST→SGST/IGST, IGST→all). Utilized: ₹${itcUtilized.toLocaleString('en-IN')} (≤ output tax).${itcCarried > 0 ? ` Carried forward: ₹${itcCarried.toLocaleString('en-IN')}` : ''}` },
    { title: 'Net tax payable', expr: `Output ₹${(s.output_tax ?? 0).toLocaleString('en-IN')} − ITC utilized ₹${itcUtilized.toLocaleString('en-IN')} = ₹${(s.net_payable ?? 0).toLocaleString('en-IN')}` },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">टैक्स कैलकुलेशन / Tax Calculation</h1>
        <p className="text-text-secondary mt-1">Current month summary and GSTR-3B preview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <Card key={label} className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${bg} ${color}`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-text-secondary">{label}</p>
              <p className="text-xl font-bold text-text-primary">
                {typeof value === 'number' ? `₹${Number(value).toLocaleString('en-IN')}` : value}
              </p>
              {sub && <p className="text-xs text-text-secondary">{sub}</p>}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <button
          type="button"
          onClick={() => setStepsOpen((o) => !o)}
          className="w-full flex items-center justify-between text-left"
        >
          <CardHeader title="Calculation steps" subtitle="Step-by-step breakdown" />
          {stepsOpen ? <ChevronDown className="w-5 h-5 text-text-secondary" /> : <ChevronRight className="w-5 h-5 text-text-secondary" />}
        </button>
        {stepsOpen && (
          <CardContent className="border-t border-white/10 pt-4">
            <ul className="space-y-3">
              {calculationSteps.map((step, i) => (
                <li key={i} className="flex justify-between items-baseline text-sm">
                  <span className="text-text-secondary">{step.title}</span>
                  <span className="font-mono text-text-primary">{step.expr}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>

      {validation && (
        <Card className={validation.pass ? 'border-success/30' : 'border-danger/30'}>
          <CardContent className="flex items-start gap-3">
            {validation.pass ? (
              <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-medium text-text-primary">
                {validation.pass ? 'Compliance check passed' : 'Compliance issues found'}
              </p>
              {validation.warnings?.length > 0 && (
                <ul className="mt-2 text-sm text-text-secondary list-disc list-inside">
                  {validation.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* GSTR-1 portal-style preview (as on official portal) */}
      <Card>
        <button
          type="button"
          onClick={() => setGstr1PreviewOpen((o) => !o)}
          className="w-full flex items-center justify-between text-left"
        >
          <CardHeader title="GSTR-1 preview" subtitle="Details of outward supplies (portal view)" />
          {gstr1PreviewOpen ? <ChevronDown className="w-5 h-5 text-text-secondary" /> : <ChevronRight className="w-5 h-5 text-text-secondary" />}
        </button>
        {gstr1PreviewOpen && (
          <CardContent className="border-t border-white/10 pt-4">
            <GSTR1PortalPreview
              gstr1={gstr1}
              business={business}
              period={period}
              status="Not Filed"
              dueDateLabel="Due Date"
            />
          </CardContent>
        )}
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setPreviewOpen((o) => !o)}
          className="w-full flex items-center justify-between text-left"
        >
          <CardHeader title="GSTR-3B summary" subtitle="Data that will be filed" />
          {previewOpen ? <ChevronDown className="w-5 h-5 text-text-secondary" /> : <ChevronRight className="w-5 h-5 text-text-secondary" />}
        </button>
        {previewOpen && gstr3b && (
          <CardContent className="border-t border-white/10 pt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary border-b border-white/10">
                  <th className="pb-2 pr-4">Table</th>
                  <th className="pb-2 pr-4">Taxable value</th>
                  <th className="pb-2 pr-4">CGST</th>
                  <th className="pb-2 pr-4">SGST</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-4 text-text-primary">3.1 Outward</td>
                  <td className="py-2 pr-4 font-mono">{Number(gstr3b.table_3_1?.taxable_value ?? 0).toLocaleString('en-IN')}</td>
                  <td className="py-2 pr-4 font-mono">{Number(gstr3b.table_3_1?.cgst ?? 0).toLocaleString('en-IN')}</td>
                  <td className="py-2 pr-4 font-mono">{Number(gstr3b.table_3_1?.sgst ?? 0).toLocaleString('en-IN')}</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-4 text-text-primary">4 ITC</td>
                  <td className="py-2 pr-4">—</td>
                  <td className="py-2 pr-4 font-mono">{Number(gstr3b.table_4?.itc_cgst ?? 0).toLocaleString('en-IN')}</td>
                  <td className="py-2 pr-4 font-mono">{Number(gstr3b.table_4?.itc_sgst ?? 0).toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-text-primary">5 Net payable</td>
                  <td className="py-2 pr-4">—</td>
                  <td className="py-2 pr-4 font-mono">{Number(gstr3b.table_5?.net_cgst ?? 0).toLocaleString('en-IN')}</td>
                  <td className="py-2 pr-4 font-mono">{Number(gstr3b.table_5?.net_sgst ?? 0).toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      <Card className="border-primary/30">
        <CardContent className="py-4 space-y-3">
          <p className="text-sm text-text-secondary">File your return on the GST portal with pre-filled data. You will complete OTP/CAPTCHA on the portal.</p>
          <div className="flex flex-wrap gap-2">
          <Button
              onClick={() => navigate('/filing/start', { state: { gstr1, gstr3b, period } })}
            className="bg-primary text-white"
          >
              📤 File now in the portal / पोर्टल पर फाइल करें
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDownloadCSV('GSTR-1')}
              disabled={!!exporting}
            >
              {exporting === 'GSTR-1' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              GSTR-1 CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDownloadCSV('GSTR-3B')}
              disabled={!!exporting}
            >
              {exporting === 'GSTR-3B' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              GSTR-3B CSV
          </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
