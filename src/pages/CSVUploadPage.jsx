import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { useAuth } from '../contexts/AuthContext'
import { normalizeFromCsv, saveNormalizedInvoice } from '../services/watcherAgent'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import Button from '../components/ui/Button'
import ValidationResults from '../components/upload/ValidationResults'
import DataTable from '../components/upload/DataTable'
import BulkProcessModal from '../components/upload/BulkProcessModal'
import { FileSpreadsheet, Download } from 'lucide-react'

const TEMPLATE_HEADERS = [
  'invoice_number',
  'invoice_date',
  'supplier_name',
  'supplier_gstin',
  'taxable_amount',
  'gst_rate',
  'gst_amount',
  'total_amount',
]

function validateGSTIN(gstin) {
  if (!gstin || typeof gstin !== 'string') return { valid: false, reason: 'Missing' }
  const s = gstin.trim()
  if (s.length !== 15) return { valid: false, reason: 'Must be 15 characters' }
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$/.test(s)) return { valid: false, reason: 'Invalid format' }
  return { valid: true }
}

function validateRow(row, index) {
  const errors = []
  const gstinResult = validateGSTIN(row.supplier_gstin)
  if (!gstinResult.valid) errors.push(`GSTIN: ${gstinResult.reason}`)
  const taxable = Number(row.taxable_amount)
  const rate = Number(row.gst_rate)
  const gst = Number(row.gst_amount)
  const total = Number(row.total_amount)
  if (isNaN(taxable) || taxable < 0) errors.push('Invalid taxable_amount')
  const expectedGst = Math.round(taxable * (rate / 100) * 100) / 100
  if (Math.abs(gst - expectedGst) > 0.02) errors.push(`GST mismatch (expected ~${expectedGst})`)
  if (Math.abs(total - (taxable + gst)) > 0.02) errors.push('Total ≠ taxable + GST')
  if (!row.invoice_number) errors.push('Missing invoice_number')
  const date = row.invoice_date ? new Date(row.invoice_date) : null
  if (!date || isNaN(date.getTime())) errors.push('Invalid date')
  return { valid: errors.length === 0, errors, index }
}

export default function CSVUploadPage() {
  const { user } = useAuth()
  const businessIdVal = user?.uid
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState([])
  const [validation, setValidation] = useState([])
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [csvType, setCsvType] = useState('purchase') // 'purchase' or 'sale'

  const onDrop = useCallback((acceptedFiles) => {
    if (!acceptedFiles.length) return
    const f = acceptedFiles[0]
    setFile(f)
    const reader = new FileReader()
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result)
      const wb = XLSX.read(data, { type: 'array' })
      const first = wb.SheetNames[0]
      const sheet = wb.Sheets[first]
      const rows = XLSX.utils.sheet_to_json(sheet)
      const normalized = rows.map((r, i) => ({
        invoice_number: r.invoice_number ?? r['Invoice Number'],
        invoice_date: r.invoice_date ?? r['Invoice Date'],
        supplier_name: r.supplier_name ?? r['Supplier Name'],
        supplier_gstin: (r.supplier_gstin ?? r['Supplier GSTIN'] ?? '').toString().trim(),
        taxable_amount: r.taxable_amount ?? r['Taxable Amount'],
        gst_rate: r.gst_rate ?? r['GST Rate'],
        gst_amount: r.gst_amount ?? r['GST Amount'],
        total_amount: r.total_amount ?? r['Total Amount'],
        _rowIndex: i + 2,
      }))
      setParsed(normalized)
      const results = normalized.map((row, i) => validateRow(row, i + 2))
      setValidation(results)
    }
    reader.readAsArrayBuffer(f)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxSize: 2 * 1024 * 1024,
  })

  const validRows = parsed.filter((_, i) => validation[i]?.valid)
  const invalidCount = validation.filter((v) => !v?.valid).length
  const validCount = validRows.length

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ['INV-001', '2025-02-01', 'ABC Ltd', '29ABCDE1234F1Z5', 10000, 18, 1800, 11800]])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
    XLSX.writeFile(wb, 'taxsetu_invoice_template.xlsx')
  }

  const handleBulkProcess = async () => {
    const isDemo = businessIdVal === 'demo'
    if (isDemo) return
    if (!businessIdVal) throw new Error('Please sign in to save invoices.')
    for (const row of validRows) {
      const normalized = normalizeFromCsv(row, { transaction_type: csvType })
      await saveNormalizedInvoice(businessIdVal, normalized, { confidence_score: 100 })
    }
  }

  const handleSuccessClose = () => {
    setParsed([])
    setValidation([])
    setFile(null)
    setShowBulkModal(false)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">CSV / Excel upload</h1>
        <p className="text-text-secondary mt-1">Bulk upload invoices with validation.</p>
      </div>

      <Card>
        <CardHeader
          title="Upload file"
          subtitle="CSV or Excel, max 2MB. Use template or demo file for correct columns."
          action={
            <div className="flex gap-2">
              <a href="/demo_invoices.csv" download="demo_invoices.csv">
                <Button variant="outline" size="sm" type="button">
                  <Download className="w-4 h-4 mr-2" /> Demo CSV
                </Button>
              </a>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="w-4 h-4 mr-2" /> Template
              </Button>
            </div>
          }
        />
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-text-secondary">This file contains:</span>
            <div className="inline-flex rounded-lg overflow-hidden border border-white/15">
              <button
                type="button"
                onClick={() => setCsvType('purchase')}
                className={`px-3 py-1 text-sm font-medium ${
                  csvType === 'purchase' ? 'bg-primary text-white' : 'bg-transparent text-text-secondary'
                }`}
              >
                Purchases (ITC)
              </button>
              <button
                type="button"
                onClick={() => setCsvType('sale')}
                className={`px-3 py-1 text-sm font-medium border-l border-white/15 ${
                  csvType === 'sale' ? 'bg-primary text-white' : 'bg-transparent text-text-secondary'
                }`}
              >
                Sales (Outward)
              </button>
            </div>
          </div>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-white/20 hover:border-white/40'
            }`}
          >
            <input {...getInputProps()} />
            <FileSpreadsheet className="w-12 h-12 mx-auto text-text-secondary mb-3" />
            <p className="text-text-primary">Drop CSV or Excel here</p>
          </div>
          {file && <p className="mt-2 text-sm text-text-secondary">{file.name}</p>}
        </CardContent>
      </Card>

      {parsed.length > 0 && (
        <>
          <ValidationResults validCount={validCount} invalidCount={invalidCount} total={parsed.length} />
          <DataTable rows={parsed} validation={validation} />
          {validCount > 0 && (
            <div className="flex justify-end">
              <Button onClick={() => setShowBulkModal(true)}>Process {validCount} valid invoices</Button>
            </div>
          )}
        </>
      )}

      {showBulkModal && (
        <BulkProcessModal
          count={validCount}
          onConfirm={handleBulkProcess}
          onCancel={() => setShowBulkModal(false)}
          onSuccessClose={handleSuccessClose}
        />
      )}

      {parsed.length === 0 && file === null && (
        <p className="text-text-secondary text-sm">Upload a CSV or Excel file to process invoices.</p>
      )}
    </div>
  )
}
