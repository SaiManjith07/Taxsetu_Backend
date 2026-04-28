import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()
const db = admin.firestore()

/**
 * Check GST portal for new notices (mock implementation).
 * In production this would use Puppeteer or GST API to login and fetch notices.
 * Request: { gstin: string, last_check_date: string | null }
 * Response: { success: boolean, new_notices: Array<{ pdf_url?, extracted_text? }> }
 */
export const checkGSTPortalNotices = onCall(
  { region: 'asia-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
    const { gstin, last_check_date, test_with_sample_notice } = request.data || {}
    if (!gstin) throw new HttpsError('invalid-argument', 'gstin required')

    // Mock: return empty or one sample notice for E2E testing
    const newNotices = []
    if (test_with_sample_notice) {
      newNotices.push({
        extracted_text: `Notice number: DRC-01A/2025-26
Date: 2025-01-15
GSTIN: ${gstin}
Period: 012025
Subject: ITC mismatch under Section 16(2)(aa).

Issue: ITC claimed in GSTR-3B for the above period exceeds the amount available in GSTR-2B.
Claimed amount: Rs 50,000. Available amount: Rs 45,000. Difference: Rs 5,000.
Affected supplier GSTINs: 29XXXXX1234X1XX.

You are required to explain the discrepancy or pay the differential tax with interest.
Reply by: 2025-02-15. Penalty may be imposed: Rs 10,000 under Section 73.`,
      })
    }

    return {
      success: true,
      new_notices: newNotices,
    }
  }
)

/**
 * Check if a supplier has filed return (re-export from calculator for Guardian use).
 * Guardian's checkSupplierFilings calls this from the client.
 * Already implemented in calculator.js as checkSupplierFiling.
 */

/**
 * Daily cron: recalculate compliance score for all businesses.
 * Runs at 9:00 AM IST.
 */
export const dailyGuardianCheck = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: 'Asia/Kolkata',
    region: 'asia-south1',
  },
  async () => {
    const businessesSnap = await db.collection('businesses').get()
    for (const docSnap of businessesSnap.docs) {
      const businessId = docSnap.id
      try {
        let score = 100
        const filingsSnap = await db
          .collection('filings')
          .where('business_id', '==', businessId)
          .get()
        let lateFilings = 0
        filingsSnap.forEach((d) => {
          if (d.data().filed_late) lateFilings++
        })
        score -= lateFilings * 3

        const noticesSnap = await db
          .collection('notices')
          .where('business_id', '==', businessId)
          .where('status', '==', 'pending')
          .get()
        score -= noticesSnap.size * 10
        score = Math.max(0, Math.min(100, score))

        await docSnap.ref.update({
          compliance_score: score,
          compliance_score_updated_at: admin.firestore.FieldValue.serverTimestamp(),
        })
      } catch (err) {
        console.error(`Guardian daily check failed for ${businessId}:`, err)
      }
    }
    console.log('Daily Guardian check completed')
  }
)
