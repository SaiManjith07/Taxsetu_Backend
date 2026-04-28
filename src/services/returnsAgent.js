import { collection, query, where, getDocs, doc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

function getCurrentPeriod() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const y = d.getFullYear()
  return `${m}${y}`
}

async function fetchInvoices(businessId, period, type) {
  const q = query(
    collection(db, 'invoices'),
    where('business_id', '==', businessId),
    where('period', '==', period),
    where('type', '==', type)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function generateGSTR1(businessId, periodInput) {
  const period = periodInput || getCurrentPeriod()
  const invoices = await fetchInvoices(businessId, period, 'outward')

  const summary = {
    total_taxable_value: 0,
    total_cgst: 0,
    total_sgst: 0,
    total_igst: 0,
    total_invoices: invoices.length,
  }

  const b2bMap = new Map()
  let b2cTaxable = 0
  let b2cCgst = 0
  let b2cSgst = 0

  invoices.forEach((inv) => {
    const taxable = Number(inv.taxable_amount) || 0
    const gstAmount = Number(inv.gst_amount) || 0
    const half = gstAmount / 2
    summary.total_taxable_value += taxable
    summary.total_cgst += half
    summary.total_sgst += half

    const gstin = (inv.supplier_gstin || '').trim()
    if (gstin) {
      const key = gstin
      const existing = b2bMap.get(key) || {
        recipient_gstin: gstin,
        trade_name: inv.supplier_name || '',
        place_of_supply: '',
        invoice_count: 0,
        taxable_value: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
      }
      existing.invoice_count += 1
      existing.taxable_value += taxable
      existing.cgst += half
      existing.sgst += half
      b2bMap.set(key, existing)
    } else {
      b2cTaxable += taxable
      b2cCgst += half
      b2cSgst += half
    }
  })

  const b2b = Array.from(b2bMap.values())
  const b2c_others = {
    taxable_value: b2cTaxable,
    cgst: b2cCgst,
    sgst: b2cSgst,
    igst: 0,
  }

  return {
    period,
    summary,
    b2b,
    b2c_others,
    hsn_summary: [],
  }
}

export async function generateGSTR2B(businessId, periodInput) {
  const period = periodInput || getCurrentPeriod()
  const invoices = await fetchInvoices(businessId, period, 'inward')

  const suppliersMap = new Map()
  let itcEligible = 0
  let itcIneligible = 0

  invoices.forEach((inv) => {
    const taxable = Number(inv.taxable_amount) || 0
    const gstAmount = Number(inv.gst_amount) || 0
    const itcAmount =
      inv.itc_eligible === true
        ? Number(inv.itc_amount ?? gstAmount) || 0
        : 0
    const ineligibleAmount =
      inv.itc_eligible === false
        ? Number(inv.itc_amount ?? gstAmount) || 0
        : 0

    itcEligible += itcAmount
    itcIneligible += ineligibleAmount

    const gstin = (inv.supplier_gstin || '').trim() || 'UNREGISTERED'
    const key = gstin
    const existing = suppliersMap.get(key) || {
      supplier_gstin: gstin,
      supplier_name: inv.supplier_name || '',
      invoice_count: 0,
      taxable_value: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      itc_eligible: 0,
    }
    const half = gstAmount / 2
    existing.invoice_count += 1
    existing.taxable_value += taxable
    existing.cgst += half
    existing.sgst += half
    existing.itc_eligible += itcAmount
    suppliersMap.set(key, existing)
  })

  return {
    period,
    summary: {
      itc_eligible: itcEligible,
      itc_ineligible: itcIneligible,
      itc_net: itcEligible - itcIneligible,
    },
    suppliers: Array.from(suppliersMap.values()),
  }
}

export async function buildAndSaveMonthlyReturns(businessId, periodInput) {
  const period = periodInput || getCurrentPeriod()
  if (!businessId || businessId === 'demo') {
    return { gstr1: null, gstr2b: null, gstr3b: null }
  }

  const [gstr1, gstr2b] = await Promise.all([
    generateGSTR1(businessId, period),
    generateGSTR2B(businessId, period),
  ])

  // Derive GSTR-3B figures from GSTR-1 (outward tax) and GSTR-2B (ITC)
  const outwardTaxable = gstr1.summary?.total_taxable_value || 0
  const outwardCgst = gstr1.summary?.total_cgst || 0
  const outwardSgst = gstr1.summary?.total_sgst || 0
  const itcEligible = gstr2b.summary?.itc_eligible || 0
  const itcCgst = itcEligible / 2
  const itcSgst = itcEligible / 2
  const netCgst = Math.max(0, outwardCgst - itcCgst)
  const netSgst = Math.max(0, outwardSgst - itcSgst)
  const netPayable = netCgst + netSgst

  const gstr3b = {
    period,
    table_3_1: {
      taxable_value: outwardTaxable,
      cgst: outwardCgst,
      sgst: outwardSgst,
    },
    table_4: {
      itc_cgst: itcCgst,
      itc_sgst: itcSgst,
    },
    table_5: {
      net_cgst: netCgst,
      net_sgst: netSgst,
      net_payable: netPayable,
    },
    _summary: {
      outward_taxable: outwardTaxable,
      outward_cgst: outwardCgst,
      outward_sgst: outwardSgst,
      itc_cgst: itcCgst,
      itc_sgst: itcSgst,
      net_cgst: netCgst,
      net_sgst: netSgst,
      net_payable: netPayable,
    },
  }

  const ref = doc(db, 'return_files', `${businessId}_${period}`)
  await setDoc(
    ref,
    {
      business_id: businessId,
      period,
      gstr1,
      gstr2b,
      gstr3b,
      updated_at: Timestamp.now(),
    },
    { merge: true }
  )

  return { gstr1, gstr2b, gstr3b }
}

export async function getMonthlyReturns(businessId, periodInput) {
  const period = periodInput || getCurrentPeriod()
  const snap = await getDocs(query(collection(db, 'return_files'), where('business_id', '==', businessId), where('period', '==', period)))
  if (snap.empty) return null
  const docData = snap.docs[0].data()
  return docData
}

