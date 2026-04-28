/**
 * Watcher Agent – Single entry point for all invoice/transaction inputs.
 * 1. Normalizes every input (photo, CSV, voice, manual) to one schema.
 * 2. Saves to Firestore with that normalized shape.
 * 3. Runs Calculator (ITC, monthly totals) after save.
 */
import { collection, doc, addDoc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureNormalizedShape } from '../schema/normalizedInvoice'
import { processInvoice, updateMonthlyTotals, flagForGuardian } from './calculatorAgent'
import { notify } from './narratorAgent'

function getCurrentPeriod() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const y = d.getFullYear()
  return `${m}${y}`
}

// --- Normalizers: any input → same normalized fields ---

/**
 * Photo upload: OCR + user-verified data.
 * @param {Object} verifiedData - From VerificationInterface (invoice_number, invoice_date, supplier_name, supplier_gstin, taxable_amount, gst_rate, gst_amount, total_amount)
 * @param {Object} opts - { imageUrl, ocrData }
 */
export function normalizeFromPhoto(verifiedData, opts = {}) {
  const v = verifiedData || {}
  const invoiceDate = v.invoice_date ? (typeof v.invoice_date === 'string' ? new Date(v.invoice_date) : v.invoice_date) : null
  const txType = opts.transaction_type === 'sale' ? 'sale' : 'purchase'
  return ensureNormalizedShape({
    invoice_number: v.invoice_number,
    invoice_date: invoiceDate,
    supplier_name: v.supplier_name,
    supplier_gstin: v.supplier_gstin,
    taxable_amount: v.taxable_amount,
    gst_rate: v.gst_rate,
    gst_amount: v.gst_amount,
    total_amount: v.total_amount,
    source: 'photo_upload',
    metadata: {
      image_url: opts.imageUrl,
      raw_data: opts.ocrData,
      transaction_type: txType,
    },
  })
}

/**
 * CSV / Excel row.
 * @param {Object} row - Row with invoice_number, invoice_date, supplier_name, supplier_gstin, taxable_amount, gst_rate, gst_amount, total_amount (or similar headers)
 */
export function normalizeFromCsv(row, opts = {}) {
  const r = row || {}
  const invoiceDate = r.invoice_date ? (typeof r.invoice_date === 'string' ? new Date(r.invoice_date) : r.invoice_date) : null
  const txType = opts.transaction_type === 'sale' ? 'sale' : 'purchase'
  return ensureNormalizedShape({
    invoice_number: r.invoice_number ?? r['Invoice Number'],
    invoice_date: invoiceDate,
    supplier_name: r.supplier_name ?? r['Supplier Name'],
    supplier_gstin: (r.supplier_gstin ?? r['Supplier GSTIN'] ?? '').toString().trim(),
    taxable_amount: Number(r.taxable_amount ?? r['Taxable Amount']) || 0,
    gst_rate: Number(r.gst_rate ?? r['GST Rate']) || 0,
    gst_amount: Number(r.gst_amount ?? r['GST Amount']) || 0,
    total_amount: Number(r.total_amount ?? r['Total Amount']) || 0,
    source: 'csv_upload',
    metadata: { raw_data: r, transaction_type: txType },
  })
}

/**
 * Voice ledger: parsed AI result + optional GSTIN and transcript.
 * Derives taxable/gst from amount when gst_included.
 */
export function normalizeFromVoice(parsed, opts = {}) {
  const p = parsed || {}
  const amount = Number(p.amount) || 0
  const gstIncluded = p.gst_included === true || p.gst_included === 'true'
  const taxableAmount = gstIncluded ? Math.round(amount / 1.18) : amount
  const gstAmount = amount - taxableAmount
  const dateRaw = p.date === 'today' || !p.date ? new Date() : new Date(p.date)
  const invoiceDate = dateRaw instanceof Date ? dateRaw : new Date(dateRaw)
  const partyGstin = (opts.partyGstin || p.party_gstin || '').trim()
  const txType = opts.transaction_type === 'sale' ? 'sale' : 'purchase'
  return ensureNormalizedShape({
    invoice_number: 'VL-' + Date.now(),
    invoice_date: invoiceDate,
    supplier_name: p.party_name || '',
    supplier_gstin: partyGstin,
    taxable_amount: taxableAmount,
    gst_rate: 18,
    gst_amount: gstAmount,
    total_amount: amount,
    source: 'voice_ledger',
    metadata: {
      voice_transcript: opts.transcript,
      from_voice: true,
      transaction_type: txType,
    },
  })
}

/**
 * Manual ledger entry.
 */
export function normalizeFromManual(entry) {
  const e = entry || {}
  const amount = Number(e.amount) || 0
  const gstIncluded = e.gst_included === true || e.gst_included === 'true'
  const taxableAmount = gstIncluded ? Math.round(amount / 1.18) : amount
  const gstAmount = amount - taxableAmount
  const dateRaw = e.date ? new Date(e.date) : new Date()
  const invoiceDate = dateRaw instanceof Date ? dateRaw : new Date(dateRaw)
  const partyGstin = (e.party_gstin || '').trim()
  const txType = e.transaction_type === 'sale' ? 'sale' : 'purchase'
  return ensureNormalizedShape({
    invoice_number: 'VL-' + Date.now(),
    invoice_date: invoiceDate,
    supplier_name: e.party_name || '',
    supplier_gstin: partyGstin,
    taxable_amount: taxableAmount,
    gst_rate: 18,
    gst_amount: gstAmount,
    total_amount: amount,
    source: 'voice_ledger',
    metadata: { from_manual_ledger: true, transaction_type: txType },
  })
}

/**
 * Save a normalized invoice to Firestore and run Calculator.
 * Use this from all entry points (photo, CSV, voice, manual).
 * @param {string} businessId - Firebase auth uid
 * @param {Object} normalized - Result from normalizeFromPhoto / normalizeFromCsv / normalizeFromVoice / normalizeFromManual
 * @param {Object} options - { confidence_score, verification_status }
 * @returns {Promise<{ id: string }>} The new document id
 */
export async function saveNormalizedInvoice(businessId, normalized, options = {}) {
  const conf = options.confidence_score ?? 85
  const status = options.verification_status ?? 'verified'
  const raw = normalized.invoice_date
  const invDate = !raw ? new Date() : raw instanceof Date ? raw : new Date(raw)

  const docRef = await addDoc(collection(db, 'invoices'), {
    business_id: businessId,
    source: normalized.source,
    invoice_number: normalized.invoice_number,
    invoice_date: invDate,
    supplier_name: normalized.supplier_name,
    supplier_gstin: normalized.supplier_gstin,
    taxable_amount: normalized.taxable_amount,
    gst_rate: normalized.gst_rate,
    gst_amount: normalized.gst_amount,
    total_amount: normalized.total_amount,
    verification_status: status,
    confidence_score: conf,
    processed_by_watcher: false,
    created_at: new Date(),
    metadata: normalized.metadata,
  })

  try {
    await runAfterInvoiceSaved(businessId, docRef.id, {
      ...normalized,
      invoice_date: invDate,
    })
  } catch (postSaveErr) {
    console.warn('Calculator/ITC update skipped:', postSaveErr?.message || postSaveErr)
  }

  return { id: docRef.id }
}

/**
 * Run after an invoice is already saved (e.g. if you did addDoc yourself).
 * Computes ITC, updates month totals, updates the invoice doc.
 * Prefer saveNormalizedInvoice() so all data goes through the normalizer.
 */
export async function runAfterInvoiceSaved(businessId, invoiceId, invoicePayload) {
  if (!businessId || !invoiceId || !invoicePayload) return
  const period = getCurrentPeriod()
  const normalized = ensureNormalizedShape(invoicePayload)
  const txType = invoicePayload.metadata?.transaction_type
  const isOutward = txType === 'sale'
  const invoice = {
    ...normalized,
    period,
    type: isOutward ? 'outward' : 'inward',
    transaction_type: txType,
    id: invoiceId,
  }
  const itcResult = await processInvoice(invoice)
  await updateMonthlyTotals(businessId, period, {
    ...invoice,
    itc_eligible: itcResult.eligible,
    itc_amount: itcResult.itc_amount,
  })
  const ref = doc(db, 'invoices', invoiceId)
  const updatedInv = {
    ...invoice,
    id: invoiceId,
    confidence_score: invoice.confidence_score ?? 85,
    rules_applied: itcResult.rules_applied ?? [],
  }
  await updateDoc(ref, {
    period,
    type: isOutward ? 'outward' : 'inward',
    itc_eligible: itcResult.eligible,
    itc_amount: itcResult.itc_amount ?? 0,
    processed_by_calculator: true,
    rules_applied: itcResult.rules_applied ?? [],
  })
  if (updatedInv.confidence_score < 80 || (itcResult.rules_applied || []).includes('ITC_BLOCKED_001')) {
    try {
      await flagForGuardian(businessId, { ...updatedInv, itc_eligible: itcResult.eligible })
    } catch (_) {}
  }
  try {
    await notify({
      event: 'invoice_processed',
      user_id: businessId,
      data: { invoice: updatedInv, itc: itcResult },
      priority: 'normal',
      channels: ['app', 'whatsapp'],
    })
  } catch (_) {}
  return itcResult
}
