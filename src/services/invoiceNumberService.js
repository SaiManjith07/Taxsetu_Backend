/**
 * Invoice number generation - TaxMitra v2.
 * Format: [GSTIN_Prefix]_[FY]_[Sequential]
 * Example: 27AABCT_2425_0847
 */
import { collection, query, where, getCountFromServer } from 'firebase/firestore'
import { db } from '../lib/firebase'

/**
 * Get current financial year string (e.g. 2425 for 2024-25).
 */
export function getCurrentFY() {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (m >= 4) return `${String(y).slice(-2)}${String(y + 1).slice(-2)}`
  return `${String(y - 1).slice(-2)}${String(y).slice(-2)}`
}

/**
 * Get next sequential number for this business (outward invoices count + 1).
 * FY-scoped optional: we use total outward count so number is unique per business.
 */
export async function getNextInvoiceSequence(businessId, _financialYear) {
  if (!businessId) return 1
  const invoicesRef = collection(db, 'invoices')
  const q = query(
    invoicesRef,
    where('business_id', '==', businessId),
    where('type', '==', 'outward')
  )
  const snap = await getCountFromServer(q)
  const count = snap.data().count
  return count + 1
}

/**
 * Generate invoice number: [GSTIN_Prefix]_[FY]_[Sequential]
 * GSTIN prefix = first 7 chars (e.g. 27AABCT from 27AABCT5055K1Z0).
 */
export async function generateInvoiceNumber(businessId, gstin) {
  const prefix = (gstin || 'INV').replace(/[^A-Za-z0-9]/g, '').slice(0, 7).toUpperCase() || 'INV'
  const fy = getCurrentFY()
  const seq = await getNextInvoiceSequence(businessId, fy)
  const seqStr = String(seq).padStart(4, '0')
  return `${prefix}_${fy}_${seqStr}`
}
