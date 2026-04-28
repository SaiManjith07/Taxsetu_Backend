import { onCall, HttpsError } from 'firebase-functions/v2/https'

/**
 * Check if a supplier has filed GSTR-1 for the given period.
 * Request: { supplier_gstin: string, period: string (MMYYYY) }
 * Response: { filed: boolean, filing_date?: string }
 */
export const checkSupplierFiling = onCall(
  { region: 'asia-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
    const { supplier_gstin, period } = request.data || {}
    if (!supplier_gstin || !period) throw new HttpsError('invalid-argument', 'supplier_gstin and period required')

    // TODO: Call GST public API to verify supplier filing when credentials available.
    // For now return a stub so ITC flow does not block.
    return {
      filed: true,
      filing_date: null,
    }
  }
)
