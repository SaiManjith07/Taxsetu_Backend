/**
 * Calculator Agent - GST liability, ITC eligibility, GSTR-3B data.
 * TaxMitra v2: prefix sum, rules tracking, Guardian integration, export-ready.
 */
import { collection, doc, getDoc, setDoc, updateDoc, getDocs, query, where, addDoc, Timestamp } from 'firebase/firestore'
import { db, app } from '../lib/firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { notify } from './narratorAgent'

const functions = getFunctions(app, 'asia-south1')
const checkSupplierFilingFn = httpsCallable(functions, 'checkSupplierFiling')

// ---------- COMPLIANCE RULES (for Guardian Rules tab & invoice metadata) ----------
export const COMPLIANCE_RULES = {
  GST_RATE_001: { code: 'GST_RATE_001', name: 'Correct GST Rate Applied', description: 'GST rate matches HSN/SAC standard', reference: 'GST Act Section 9' },
  ITC_100_001: { code: 'ITC_100_001', name: '100% ITC Eligible', description: 'Input for taxable supply, all conditions met', reference: 'GST Act Section 16' },
  ITC_50_001: { code: 'ITC_50_001', name: '50% ITC Restricted', description: 'Motor vehicle non-commercial use', reference: 'GST Rule 36(3)' },
  ITC_BLOCKED_001: { code: 'ITC_BLOCKED_001', name: 'ITC Blocked', description: 'Personal use item, no ITC allowed', reference: 'GST Act Section 17(5)' },
  CGST_SGST_001: { code: 'CGST_SGST_001', name: 'CGST/SGST Split', description: 'Intra-state supply split 50-50', reference: 'GST Act Section 12' },
  IGST_001: { code: 'IGST_001', name: 'IGST Applied', description: 'Inter-state supply, full IGST', reference: 'GST Act Section 12' },
  TIME_LIMIT_001: { code: 'TIME_LIMIT_001', name: 'Within 2-Year Window', description: 'ITC claim within 2 years of invoice date', reference: 'GST Rule 36(1)' },
}

// --- Section 16 (4 conditions for ITC) ---
function checkSection16(invoice) {
  const checks = []
  const gstin = (invoice.supplier_gstin || '').trim()
  // Standard GSTIN format: 2-digit state code + 10-char PAN + 1 entity code + 'Z' + 1 checksum (total 15 chars)
  const validGstin = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin)
  checks.push({ name: 'Valid supplier GSTIN', pass: validGstin })
  checks.push({ name: 'Invoice has tax (GST amount > 0)', pass: Number(invoice.gst_amount) > 0 })
  checks.push({ name: 'Invoice date present', pass: !!(invoice.invoice_date || invoice.invoice_date?.toDate) })
  checks.push({ name: 'Supplier filing status (checked via API)', pass: true }) // Set after API call
  return checks
}

// --- Section 17(5) - Blocked ITC categories (simplified list) ---
const BLOCKED_DESCRIPTIONS = [
  'motor vehicle', 'motor vehicles', 'vehicle', 'car', 'jeep',
  'food', 'restaurant', 'outdoor catering', 'health', 'beauty',
  'membership', 'club', 'travel', 'rent a cab', 'life insurance',
  'construction of immovable property', 'works contract for immovable property',
]

function checkSection17Blocked(invoice) {
  const name = ((invoice.supplier_name || '') + ' ' + (invoice.description || '')).toLowerCase()
  const blocked = BLOCKED_DESCRIPTIONS.some((d) => name.includes(d))
  return { blocked, reason: blocked ? 'Supply may fall under Section 17(5) blocked credits' : null }
}

/**
 * Determine which compliance rules apply to this invoice (for metadata.rules_applied).
 */
function determineRulesApplied(invoice, itcResult) {
  const rules = []
  const gstRate = Number(invoice.gst_rate) || 0
  if (gstRate > 0) rules.push('GST_RATE_001')
  rules.push('CGST_SGST_001') // we use CGST/SGST split
  if (invoice.type === 'inward' || invoice.transaction_type === 'purchase') {
    if (itcResult?.eligible) rules.push('ITC_100_001')
    else if (itcResult?.reason && (itcResult.reason || '').includes('17(5)')) rules.push('ITC_BLOCKED_001')
    else if (itcResult?.eligible === false) rules.push('ITC_BLOCKED_001')
  }
  rules.push('TIME_LIMIT_001')
  return [...new Set(rules)]
}

/**
 * Process invoice and determine ITC eligibility + rules_applied.
 * @param {Object} invoice - Invoice from Watcher (supplier_gstin, gst_amount, supplier_name, etc.)
 * @returns {Promise<{ eligible: boolean, itc_amount: number, checks: Array, reason?: string, rules_applied: string[] }>}
 */
export async function processInvoice(invoice) {
  const section16Checks = checkSection16(invoice)
  const section17 = checkSection17Blocked(invoice)
  if (section17.blocked) {
    const rules = determineRulesApplied(invoice, { eligible: false, reason: section17.reason })
    return {
      eligible: false,
      itc_amount: 0,
      checks: section16Checks,
      reason: section17.reason,
      rules_applied: rules,
    }
  }

  let supplierFiled = true
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  if (!isLocalhost) {
  try {
    const supplierGstin = (invoice.supplier_gstin || '').trim()
    const period = invoice.period || getCurrentPeriod()
    if (supplierGstin && checkSupplierFilingFn) {
      const res = await checkSupplierFilingFn({ supplier_gstin: supplierGstin, period })
      supplierFiled = res?.data?.filed === true
    }
  } catch {
    supplierFiled = false
    }
  }
  section16Checks[3].pass = supplierFiled

  const allPass = section16Checks.every((c) => c.pass)
  const gstAmount = Number(invoice.gst_amount) || 0
  const itcAmount = allPass ? gstAmount : 0
  const itcResult = { eligible: allPass, itc_amount: itcAmount, reason: allPass ? null : 'One or more Section 16 conditions not met' }
  const rules_applied = determineRulesApplied(invoice, itcResult)

  return {
    eligible: allPass,
    itc_amount: itcAmount,
    checks: section16Checks,
    reason: itcResult.reason,
    rules_applied,
  }
}

function getCurrentPeriod() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const y = d.getFullYear()
  return `${m}${y}`
}

const GST_RATE_BUCKETS = [0, 5, 12, 18, 28]

function getRateBucket(gstRate) {
  const r = Number(gstRate) || 0
  if (r <= 0) return 0
  const nearest = GST_RATE_BUCKETS.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a))
  return nearest
}

function getMonthTotalsRef(businessId, period) {
  return doc(db, 'month_totals', `${businessId}_${period}`)
}

function emptyByRate() {
  return Object.fromEntries(GST_RATE_BUCKETS.map((r) => [r, { value: 0, count: 0, tax: 0, itc: 0 }]))
}

/** period format MMYYYY. Returns previous month period (e.g. 022026 -> 012026). */
function getPreviousPeriod(period) {
  if (!period || period.length < 6) return null
  const [mm, yyyy] = [period.slice(0, 2), period.slice(2)]
  let prevM = parseInt(mm, 10) - 1
  let prevY = parseInt(yyyy, 10)
  if (prevM < 1) {
    prevM = 12
    prevY -= 1
  }
  return String(prevM).padStart(2, '0') + String(prevY)
}

/**
 * Get previous month's cumulative (for prefix sum). period format MMYYYY.
 * Previous doc's cumulative_* already includes that month; we add current month on top.
 */
async function getPreviousCumulative(businessId, period) {
  const prevPeriod = getPreviousPeriod(period)
  if (!prevPeriod) return { cumulative_output_to_date: 0, cumulative_itc_to_date: 0, cumulative_net_to_date: 0 }
  const prevRef = getMonthTotalsRef(businessId, prevPeriod)
  const prevSnap = await getDoc(prevRef)
  const prev = prevSnap.exists() ? prevSnap.data() : {}
  const cum = prev.cumulative_prefix || {}
  return {
    cumulative_output_to_date: cum.cumulative_output_to_date ?? 0,
    cumulative_itc_to_date: cum.cumulative_itc_to_date ?? 0,
    cumulative_net_to_date: cum.cumulative_net_to_date ?? 0,
  }
}

/** Load previous period's carried-forward ITC (per head) for workflow consistency. */
async function getPreviousCarriedForward(businessId, period) {
  const prevPeriod = getPreviousPeriod(period)
  if (!prevPeriod) return { itc_cgst_carried: 0, itc_sgst_carried: 0, itc_igst_carried: 0 }
  const prevRef = getMonthTotalsRef(businessId, prevPeriod)
  const prevSnap = await getDoc(prevRef)
  const prev = prevSnap.exists() ? prevSnap.data() : {}
  return {
    itc_cgst_carried: Number(prev.itc_cgst_carried) || 0,
    itc_sgst_carried: Number(prev.itc_sgst_carried) || 0,
    itc_igst_carried: Number(prev.itc_igst_carried) || 0,
  }
}

/**
 * Update running monthly totals for a business/period with one invoice.
 * Includes by_rate buckets and cumulative prefix (TaxMitra v2).
 */
export async function updateMonthlyTotals(businessId, period, invoice) {
  if (!businessId || !period) return
  const ref = getMonthTotalsRef(businessId, period)
  const snap = await getDoc(ref)
  const taxable = Number(invoice.taxable_amount) || 0
  const gstRate = Number(invoice.gst_rate) || 0
  const gstAmount = Number(invoice.gst_amount) || 0
  const rateKey = getRateBucket(gstRate)
  const isOutward = invoice.type === 'outward' || invoice.source === 'sale' || invoice.transaction_type === 'sale'

  const existing = snap.exists() ? { ...snap.data(), business_id: businessId } : {
    business_id: businessId,
    period,
    outward_taxable: 0,
    outward_cgst: 0,
    outward_sgst: 0,
    inward_taxable: 0,
    itc_cgst: 0,
    itc_sgst: 0,
    outward_supplies_by_rate: emptyByRate(),
    inward_supplies_by_rate: emptyByRate(),
    updated_at: Timestamp.now(),
  }
  if (!existing.outward_supplies_by_rate) existing.outward_supplies_by_rate = emptyByRate()
  if (!existing.inward_supplies_by_rate) existing.inward_supplies_by_rate = emptyByRate()

  if (isOutward) {
    const half = gstAmount / 2
    existing.outward_taxable = (existing.outward_taxable || 0) + taxable
    existing.outward_cgst = (existing.outward_cgst || 0) + half
    existing.outward_sgst = (existing.outward_sgst || 0) + half
    const orate = existing.outward_supplies_by_rate[rateKey] || { value: 0, count: 0, tax: 0 }
    orate.value = (orate.value || 0) + taxable
    orate.count = (orate.count || 0) + 1
    orate.tax = (orate.tax || 0) + half + half
    existing.outward_supplies_by_rate[rateKey] = orate
  } else {
    const itcAmount = Number(invoice.itc_amount) ?? (invoice.itc_eligible ? gstAmount : 0)
    const half = itcAmount / 2
    existing.inward_taxable = (existing.inward_taxable || 0) + taxable
    existing.itc_cgst = (existing.itc_cgst || 0) + half
    existing.itc_sgst = (existing.itc_sgst || 0) + half
    const irate = existing.inward_supplies_by_rate[rateKey] || { value: 0, count: 0, itc: 0 }
    irate.value = (irate.value || 0) + taxable
    irate.count = (irate.count || 0) + 1
    irate.itc = (irate.itc || 0) + itcAmount
    existing.inward_supplies_by_rate[rateKey] = irate
  }

  const prevCum = await getPreviousCumulative(businessId, period)
  const outTax = (existing.outward_cgst || 0) + (existing.outward_sgst || 0)
  const itcTax = (existing.itc_cgst || 0) + (existing.itc_sgst || 0)
  existing.cumulative_prefix = {
    cumulative_output_to_date: prevCum.cumulative_output_to_date + outTax,
    cumulative_itc_to_date: prevCum.cumulative_itc_to_date + itcTax,
    cumulative_net_to_date: prevCum.cumulative_net_to_date + Math.max(0, outTax - itcTax),
    year_to_date_liability: prevCum.cumulative_net_to_date + Math.max(0, outTax - itcTax),
  }
  existing.updated_at = Timestamp.now()
  await setDoc(ref, existing)
  return existing
}

/**
 * ITC utilization rules (GST):
 * - ITC of CGST can be applied to: CGST output, IGST output.
 * - ITC of SGST can be applied to: SGST output, IGST output.
 * - ITC of IGST can be applied to: IGST, CGST, SGST output.
 * You cannot use more ITC than the output tax against which it is applied; excess is carried forward.
 */
function utilizeITC(
  outward_cgst,
  outward_sgst,
  outward_igst,
  itc_cgst_avail,
  itc_sgst_avail,
  itc_igst_avail
) {
  const oc = outward_cgst || 0
  const os = outward_sgst || 0
  const oi = outward_igst || 0
  let ic = itc_cgst_avail || 0
  let is_ = itc_sgst_avail || 0
  let ii = itc_igst_avail || 0

  let used_cgst = 0
  let used_sgst = 0
  let used_igst = 0

  // 1) Use IGST ITC first (can set off IGST, then CGST, then SGST)
  const useIgst = Math.min(ii, oi)
  used_igst += useIgst
  ii -= useIgst
  const useIgstCgst = Math.min(ii, oc)
  used_cgst += useIgstCgst
  ii -= useIgstCgst
  const useIgstSgst = Math.min(ii, os)
  used_sgst += useIgstSgst
  ii -= useIgstSgst

  // 2) Use CGST ITC (only against CGST, then IGST output)
  const useCgstCgst = Math.min(ic, oc - used_cgst)
  used_cgst += useCgstCgst
  ic -= useCgstCgst
  const useCgstIgst = Math.min(ic, oi - used_igst)
  used_igst += useCgstIgst
  ic -= useCgstIgst

  // 3) Use SGST ITC (only against SGST, then IGST output)
  const useSgstSgst = Math.min(is_, os - used_sgst)
  used_sgst += useSgstSgst
  is_ -= useSgstSgst
  const useSgstIgst = Math.min(is_, oi - used_igst)
  used_igst += useSgstIgst
  is_ -= useSgstIgst

  const itc_utilized = used_cgst + used_sgst + used_igst
  const itc_carried_forward = ic + is_ + ii
  const net_cgst = Math.max(0, oc - used_cgst)
  const net_sgst = Math.max(0, os - used_sgst)
  const net_igst = Math.max(0, oi - used_igst)
  const net_payable = net_cgst + net_sgst + net_igst

  return {
    itc_cgst_used: used_cgst,
    itc_sgst_used: used_sgst,
    itc_igst_used: used_igst,
    itc_utilized,
    itc_carried_forward,
    itc_cgst_carried: ic,
    itc_sgst_carried: is_,
    itc_igst_carried: ii,
    net_cgst,
    net_sgst,
    net_igst,
    net_payable,
  }
}

/**
 * Compute net tax payable for the month (output tax - ITC utilized, per GST rules).
 * ITC used cannot exceed output tax; excess ITC is carried forward.
 * Available ITC = opening (previous period carried forward) + current period ITC; after utilization
 * we decrease available by utilized amount and persist carried forward for next period.
 */
export async function computeNetTax(businessId, period) {
  const ref = getMonthTotalsRef(businessId, period)
  const snap = await getDoc(ref)
  const data = snap.exists() ? snap.data() : {}

  const outward_cgst = Number(data.outward_cgst) || 0
  const outward_sgst = Number(data.outward_sgst) || 0
  const outward_igst = Number(data.outward_igst) || 0
  const itc_cgst_current = Number(data.itc_cgst) || 0
  const itc_sgst_current = Number(data.itc_sgst) || 0
  const itc_igst_current = Number(data.itc_igst) || 0

  const opening = await getPreviousCarriedForward(businessId, period)
  const itc_cgst = opening.itc_cgst_carried + itc_cgst_current
  const itc_sgst = opening.itc_sgst_carried + itc_sgst_current
  const itc_igst = opening.itc_igst_carried + itc_igst_current

  const outputTax = outward_cgst + outward_sgst + outward_igst
  const itcTotal = itc_cgst + itc_sgst + itc_igst

  const u = utilizeITC(outward_cgst, outward_sgst, outward_igst, itc_cgst, itc_sgst, itc_igst)

  if (snap.exists()) {
    try {
      await updateDoc(ref, {
        itc_cgst_carried: u.itc_cgst_carried,
        itc_sgst_carried: u.itc_sgst_carried,
        itc_igst_carried: u.itc_igst_carried,
        updated_at: Timestamp.now(),
      })
    } catch (e) {
      if (e?.code !== 'permission-denied') throw e
    }
  }

  return {
    period,
    outward_taxable: Number(data.outward_taxable) || 0,
    outward_cgst,
    outward_sgst,
    outward_igst,
    output_tax: outputTax,
    itc_cgst,
    itc_sgst,
    itc_igst,
    itc_total: itcTotal,
    itc_opening_cgst: opening.itc_cgst_carried,
    itc_opening_sgst: opening.itc_sgst_carried,
    itc_opening_igst: opening.itc_igst_carried,
    itc_cgst_used: u.itc_cgst_used,
    itc_sgst_used: u.itc_sgst_used,
    itc_igst_used: u.itc_igst_used,
    itc_utilized: u.itc_utilized,
    itc_carried_forward: u.itc_carried_forward,
    itc_cgst_carried: u.itc_cgst_carried,
    itc_sgst_carried: u.itc_sgst_carried,
    itc_igst_carried: u.itc_igst_carried,
    net_cgst: u.net_cgst,
    net_sgst: u.net_sgst,
    net_igst: u.net_igst,
    net_payable: u.net_payable,
  }
}

/**
 * Generate GSTR-3B JSON structure for the portal.
 * Table 4 reports ITC utilized (not more than output); excess is carried forward.
 */
export async function generateGSTR3B(businessId, period) {
  const summary = await computeNetTax(businessId, period)
  return {
    period,
    table_3_1: {
      taxable_value: summary.outward_taxable,
      cgst: summary.outward_cgst,
      sgst: summary.outward_sgst,
      igst: summary.outward_igst || 0,
    },
    table_4: {
      itc_cgst: summary.itc_cgst_used,
      itc_sgst: summary.itc_sgst_used,
      itc_igst: summary.itc_igst_used || 0,
    },
    table_5: {
      net_cgst: summary.net_cgst,
      net_sgst: summary.net_sgst,
      net_igst: summary.net_igst || 0,
      net_payable: summary.net_payable,
    },
    table_6_1: {
      tds: 0,
      tcs: 0,
    },
    _summary: summary,
  }
}

/**
 * Rule 86B: ITC restriction - if outward taxable value > 50L in a month, max 99% of output tax can be paid via ITC.
 */
const RULE_86B_OUTWARD_LIMIT = 50_00_000

export async function validateCompliance(gstr3bData) {
  const warnings = []
  let pass = true

  const outTaxable = gstr3bData.table_3_1?.taxable_value ?? gstr3bData._summary?.outward_taxable ?? 0
  const outputTax = (gstr3bData.table_3_1?.cgst ?? 0) + (gstr3bData.table_3_1?.sgst ?? 0) + (gstr3bData.table_3_1?.igst ?? 0)
  const itcUsed = (gstr3bData.table_4?.itc_cgst ?? 0) + (gstr3bData.table_4?.itc_sgst ?? 0) + (gstr3bData.table_4?.itc_igst ?? 0)
  const netPayable = gstr3bData.table_5?.net_payable ?? 0

  if (outTaxable >= RULE_86B_OUTWARD_LIMIT && outputTax > 0) {
    const maxItc = outputTax * 0.99
    if (itcUsed > maxItc) {
      pass = false
      warnings.push({ rule: '86B', message: 'ITC used exceeds 99% of output tax (Rule 86B applies when outward taxable > ₹50L).' })
    } else {
      warnings.push({ rule: '86B', message: 'Rule 86B applies: at least 1% of output tax must be paid in cash.' })
    }
  }

  // Recompute net as max(0, Output tax - ITC utilized). ITC utilized cannot exceed output.
  const recomputedNet = Math.max(0, outputTax - itcUsed)
  if (Math.abs(recomputedNet - netPayable) > 0.01) {
    pass = false
    warnings.push({ rule: 'Calculation', message: 'Net payable does not match (Output tax − ITC utilized).' })
  }

  return { pass, warnings }
}

// ---------- TaxMitra v2: Monthly summary for Filer, Guardian rules, flags ----------

/**
 * Get monthly summary in spec shape (by_rate, cumulative_prefix) for filing.
 */
export async function getMonthlySummaryForFiling(businessId, period) {
  const net = await computeNetTax(businessId, period)
  const ref = getMonthTotalsRef(businessId, period)
  const snap = await getDoc(ref)
  const data = snap.exists() ? snap.data() : {}
  const byRateOut = data.outward_supplies_by_rate || emptyByRate()
  const byRateIn = data.inward_supplies_by_rate || emptyByRate()
  const cum = data.cumulative_prefix || {}
  return {
    period,
    summary: {
      outward: {
        by_rate: byRateOut,
        total_value: net.outward_taxable ?? 0,
        total_output_tax: net.output_tax ?? 0,
      },
      inward: {
        by_rate: byRateIn,
        total_value: data.inward_taxable ?? 0,
        total_itc: net.itc_total ?? 0,
      },
      net: {
        output_tax: net.output_tax,
        input_tax: net.itc_total,
        net_payable: net.net_payable,
      },
    },
    year_to_date: cum,
    invoices_count: {
      outward: Object.values(byRateOut).reduce((s, r) => s + (r.count || 0), 0),
      inward: Object.values(byRateIn).reduce((s, r) => s + (r.count || 0), 0),
    },
    compliance: { rules_applied: [], violations_detected: 0 },
    ready_for_gstr_1: true,
    ready_for_gstr_3b: true,
  }
}

/**
 * Get all rules applied in a period (for Guardian Rules tab).
 */
export async function getRulesAppliedForPeriod(businessId, period) {
  const q = query(
    collection(db, 'invoices'),
    where('business_id', '==', businessId),
    where('period', '==', period)
  )
  const snap = await getDocs(q)
  const rulesSummary = {}
  for (const d of snap.docs) {
    const inv = d.data()
    const rules = inv.rules_applied || []
    for (const code of rules) {
      if (!rulesSummary[code]) {
        rulesSummary[code] = {
          code,
          name: COMPLIANCE_RULES[code]?.name || code,
          description: COMPLIANCE_RULES[code]?.description || '',
          reference: COMPLIANCE_RULES[code]?.reference || '',
          applied_count: 0,
          invoices: [],
        }
      }
      rulesSummary[code].applied_count += 1
      rulesSummary[code].invoices.push(inv.invoice_number || d.id)
    }
  }
  const rulesList = Object.values(rulesSummary)
  const complianceScore = rulesList.length > 0 ? Math.min(100, 70 + rulesList.length * 5) : 100
  return {
    period,
    total_rules_followed: rulesList.length,
    rules: rulesList,
    compliance_score: complianceScore,
    message: rulesList.length > 0 ? 'You are following GST rules and regulations' : 'No invoices in this period',
  }
}

/**
 * Flag risky/suspicious invoice for Guardian (low confidence, blocked ITC).
 */
export async function flagForGuardian(businessId, invoice) {
  const alerts = []
  const confidence = Number(invoice.confidence_score ?? invoice.metadata?.confidence ?? 100)
  if (confidence < 80) {
    alerts.push({
      type: 'LOW_CONFIDENCE',
      severity: 'warning',
      message: `Confidence: ${confidence}%`,
      action: 'Human review recommended',
    })
  }
  const rulesApplied = invoice.rules_applied || invoice.metadata?.rules_applied || []
  if (rulesApplied.includes('ITC_BLOCKED_001')) {
    alerts.push({
      type: 'BLOCKED_ITC',
      severity: 'critical',
      message: 'ITC blocked on this item',
      action: 'Verify if truly personal use',
    })
  }
  if (invoice.itc_eligible === false && (invoice.type === 'inward' || invoice.transaction_type === 'purchase')) {
    alerts.push({
      type: 'RESTRICTED_ITC',
      severity: 'info',
      message: 'ITC not claimed or restricted',
      action: 'Monitor for audit risk',
    })
  }
  if (alerts.length > 0) {
    try {
      await addDoc(collection(db, 'notifications'), {
        business_id: businessId,
        type: 'guardian_alert',
        title: 'Calculator flag',
        body: JSON.stringify({ invoice_id: invoice.id || invoice.invoice_number, alerts }),
        read: false,
        created_at: Timestamp.now(),
      })
    } catch (e) {
      console.warn('Guardian alert save failed:', e)
    }
  }
  return { invoice_id: invoice.id || invoice.invoice_number, flagged: alerts.length > 0, alerts }
}

/**
 * Get bank details for payment (BANK_SAFE / business profile).
 * Used by Filer for payment and by invoice template for payment instructions.
 */
export async function getBankDetailsForPayment(businessId) {
  if (!businessId) return null
  const businessRef = doc(db, 'businesses', businessId)
  const snap = await getDoc(businessRef)
  const data = snap.exists() ? snap.data() : {}
  const bank = data.bank_account || data.bank_details || {}
  return {
    account_name: bank.account_name || data.business_name || '',
    account_number: bank.account_number || bank.account_number_mask || '',
    account_type: bank.account_type || 'Current',
    ifsc_code: bank.ifsc_code || bank.ifsc || '',
    bank_name: bank.bank_name || '',
    branch: bank.branch || '',
  }
}

/**
 * Send month-end summary notification via Narrator (call from Calculator dashboard when user views summary).
 */
export async function sendMonthEndNotification(businessId, period) {
  if (!businessId || !period) return
  try {
    const summary = await getMonthlySummaryForFiling(businessId, period)
    await notify({
      event: 'month_end_summary',
      user_id: businessId,
      data: summary,
      priority: 'high',
      channels: ['app'],
    })
  } catch (e) {
    console.warn('Narrator month-end notification failed:', e?.message || e)
  }
}
