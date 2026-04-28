import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()
const db = admin.firestore()

/**
 * Save filing record after successful submission.
 * Request: { business_id, period, return_type, arn, data (filing payload) }
 */
export const saveFiling = onCall(
  { region: 'asia-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
    const uid = request.auth.uid
    const { business_id, period, return_type, arn, data: filing_data } = request.data || {}
    if (!business_id || business_id !== uid) throw new HttpsError('permission-denied', 'Invalid business')
    if (!period || !return_type) throw new HttpsError('invalid-argument', 'period and return_type required')

    await db.collection('filings').add({
      business_id,
      period,
      return_type: return_type || 'GSTR-3B',
      status: 'FILED',
      arn: arn || null,
      filed_at: admin.firestore.FieldValue.serverTimestamp(),
      filed_late: false,
      data: filing_data || null,
    })

    // TODO: Trigger Narrator agent for WhatsApp notification when implemented
    // await triggerNarrator(business_id, { event: 'filing_success', return_type, period, arn })

    return { success: true }
  }
)
