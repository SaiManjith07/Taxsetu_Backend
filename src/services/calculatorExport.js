/**
 * Calculator Export - GSTR CSV and preview for Filer (TaxMitra v2).
 * Portal-format CSV and preview for GSTR-1 / GSTR-3B.
 */
import { generateGSTR1 } from './returnsAgent'
import { generateGSTR3B, getMonthlySummaryForFiling } from './calculatorAgent'

function getCurrentPeriod() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const y = d.getFullYear()
  return `${m}${y}`
}

function escapeCsvCell(val) {
  const s = val == null ? '' : String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function rowsToCsvBytes(rows) {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
  return new TextEncoder().encode('\uFEFF' + csv)
}

/**
 * Export GSTR-1 (outward supplies) in GST portal CSV format.
 */
export async function exportGSTR1CSV(businessId, periodInput) {
  const period = periodInput || getCurrentPeriod()
  const gstr1 = await generateGSTR1(businessId, period)
  const header = [
    'Invoice Number',
    'Invoice Date',
    'Supplier GSTIN',
    'Recipient GSTIN',
    'HSN/SAC',
    'Item Description',
    'Quantity',
    'Unit',
    'Unit Price',
    'Amount Ex GST',
    'CGST',
    'SGST',
    'IGST',
    'Total Inc GST',
    'Document Type',
  ]
  const rows = [header]
  for (const row of gstr1.b2b || []) {
    const taxable = Number(row.taxable_value) || 0
    const cgst = Number(row.cgst) || 0
    const sgst = Number(row.sgst) || 0
    const igst = Number(row.igst) || 0
    rows.push([
      `B2B-${(row.recipient_gstin || '').slice(0, 10)}`,
      new Date().toISOString().slice(0, 10),
      '—',
      row.recipient_gstin ?? '—',
      '8471',
      row.trade_name || 'B2B Supply',
      row.invoice_count ?? 1,
      'Unit',
      taxable,
      taxable,
      cgst,
      sgst,
      igst,
      taxable + cgst + sgst + igst,
      'Invoice',
    ])
  }
  if (gstr1.b2c_others && (Number(gstr1.b2c_others.taxable_value) || 0) > 0) {
    rows.push([
      'B2C-OTHERS',
      new Date().toISOString().slice(0, 10),
      '—',
      'URP',
      '8471',
      'B2C Others',
      1,
      'Unit',
      gstr1.b2c_others.taxable_value,
      gstr1.b2c_others.taxable_value,
      gstr1.b2c_others.cgst ?? 0,
      gstr1.b2c_others.sgst ?? 0,
      0,
      (Number(gstr1.b2c_others.taxable_value) || 0) + (Number(gstr1.b2c_others.cgst) || 0) + (Number(gstr1.b2c_others.sgst) || 0),
      'Invoice',
    ])
  }
  return rowsToCsvBytes(rows)
}

/**
 * Export GSTR-3B (tax liability) in portal CSV format.
 */
export async function exportGSTR3BCSV(businessId, periodInput) {
  const period = periodInput || getCurrentPeriod()
  const gstr3b = await generateGSTR3B(businessId, period)
  const summary = await getMonthlySummaryForFiling(businessId, period)
  const outByRate = summary.summary?.outward?.by_rate || {}
  const inByRate = summary.summary?.inward?.by_rate || {}
  const t31 = gstr3b.table_3_1 || {}
  const t4 = gstr3b.table_4 || {}
  const t5 = gstr3b.table_5 || {}
  const rows = [
    ['Field', 'Value'],
    ['Period', period],
    ['', ''],
    ['OUTWARD SUPPLIES', ''],
    ['Supply @ 0%', outByRate[0]?.value ?? 0],
    ['Supply @ 5%', outByRate[5]?.value ?? 0],
    ['Supply @ 12%', outByRate[12]?.value ?? 0],
    ['Supply @ 18%', outByRate[18]?.value ?? 0],
    ['Supply @ 28%', outByRate[28]?.value ?? 0],
    ['Total Output Value', t31.taxable_value ?? 0],
    ['Total Output Tax', (Number(t31.cgst) || 0) + (Number(t31.sgst) || 0)],
    ['', ''],
    ['INPUT TAX CREDIT', ''],
    ['ITC @ 0%', inByRate[0]?.itc ?? 0],
    ['ITC @ 5%', inByRate[5]?.itc ?? 0],
    ['ITC @ 12%', inByRate[12]?.itc ?? 0],
    ['ITC @ 18%', inByRate[18]?.itc ?? 0],
    ['ITC @ 28%', inByRate[28]?.itc ?? 0],
    ['Total ITC', (Number(t4.itc_cgst) || 0) + (Number(t4.itc_sgst) || 0)],
    ['', ''],
    ['NET LIABILITY', ''],
    ['Output Tax', (Number(t31.cgst) || 0) + (Number(t31.sgst) || 0)],
    ['Less: ITC', (Number(t4.itc_cgst) || 0) + (Number(t4.itc_sgst) || 0)],
    ['Net Payable', t5.net_payable ?? 0],
  ]
  return rowsToCsvBytes(rows)
}

/**
 * Generate export preview for Filer (row count, totals, warnings).
 */
export async function generateExportPreview(businessId, periodInput, exportType) {
  const period = periodInput || getCurrentPeriod()
  const warnings = []
  let row_count = 0
  let total_value = 0
  let total_tax = 0
  let preview_rows = []

  if (exportType === 'GSTR-1') {
    const gstr1 = await generateGSTR1(businessId, period)
    const b2b = gstr1.b2b || []
    row_count = b2b.length
    if (gstr1.b2c_others && (Number(gstr1.b2c_others.taxable_value) || 0) > 0) row_count += 1
    total_value = gstr1.summary?.total_taxable_value ?? 0
    total_tax = (gstr1.summary?.total_cgst ?? 0) + (gstr1.summary?.total_sgst ?? 0)
    preview_rows = b2b.slice(0, 20).map((r) => ({
      invoice_number: r.invoice_number ?? r.recipient_gstin,
      recipient_gstin: r.recipient_gstin,
      taxable_value: r.taxable_value,
      cgst: r.cgst,
      sgst: r.sgst,
    }))
    if (row_count === 0) warnings.push('No outward supplies in this period.')
  } else if (exportType === 'GSTR-3B') {
    const gstr3b = await generateGSTR3B(businessId, period)
    row_count = 1
    total_value = gstr3b.table_3_1?.taxable_value ?? 0
    total_tax = (gstr3b.table_3_1?.cgst ?? 0) + (gstr3b.table_3_1?.sgst ?? 0)
    preview_rows = [
      {
        field: 'Outward taxable',
        value: gstr3b.table_3_1?.taxable_value,
      },
      {
        field: 'Output tax',
        value: (Number(gstr3b.table_3_1?.cgst) || 0) + (Number(gstr3b.table_3_1?.sgst) || 0),
      },
      {
        field: 'ITC',
        value: (Number(gstr3b.table_4?.itc_cgst) || 0) + (Number(gstr3b.table_4?.itc_sgst) || 0),
      },
      {
        field: 'Net payable',
        value: gstr3b.table_5?.net_payable,
      },
    ]
  }

  return {
    period,
    export_type: exportType,
    row_count,
    total_value,
    total_tax,
    preview_rows,
    warnings,
    ready_to_file: warnings.length === 0,
    action_next: "Click 'FILE NOW ON PORTAL' when ready",
  }
}
