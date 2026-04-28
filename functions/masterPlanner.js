import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()
const db = admin.firestore()

/**
 * Scheduled: Daily compliance check at 9:00 AM IST.
 * Creates a workflow execution record per business and runs compliance score update (Guardian logic).
 */
export const dailyComplianceCheck = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: 'Asia/Kolkata',
    region: 'asia-south1',
  },
  async () => {
    const businessesSnap = await db.collection('businesses').get()
    for (const docSnap of businessesSnap.docs) {
      const businessId = docSnap.id
      const executionRef = await db.collection('workflow_executions').add({
        workflow_id: 'daily_compliance_check',
        workflow_name: 'Daily Compliance Monitoring',
        business_id: businessId,
        status: 'running',
        current_step: 0,
        total_steps: 3,
        started_at: admin.firestore.FieldValue.serverTimestamp(),
        trigger_data: {},
        context: { business_id: businessId },
        step_results: [],
        errors: [],
      })
      try {
        let score = 100
        const filingsSnap = await db.collection('filings').where('business_id', '==', businessId).get()
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
        await executionRef.update({
          status: 'completed',
          completed_at: admin.firestore.FieldValue.serverTimestamp(),
          current_step: 3,
          step_results: admin.firestore.FieldValue.arrayUnion({
            step: 3,
            agent: 'guardian',
            action: 'recalculateComplianceScore',
            status: 'success',
            completed_at: new Date().toISOString(),
          }),
        })
      } catch (err) {
        console.error(`Daily compliance check failed for ${businessId}:`, err)
        await executionRef.update({
          status: 'failed',
          failed_at: admin.firestore.FieldValue.serverTimestamp(),
          error: err.message,
          errors: admin.firestore.FieldValue.arrayUnion({
            step: 3,
            error: err.message,
            timestamp: new Date().toISOString(),
          }),
        })
      }
    }
    console.log('Master Planner: daily compliance check completed')
  }
)

/**
 * Callable: Run daily compliance workflow for one business (e.g. from UI).
 * Request: { business_id: string }
 */
export const runDailyComplianceForBusiness = onCall(
  { region: 'asia-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
    const { business_id } = request.data || {}
    if (!business_id || business_id !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Invalid business_id')
    }
    const executionRef = await db.collection('workflow_executions').add({
      workflow_id: 'daily_compliance_check',
      workflow_name: 'Daily Compliance Monitoring',
      business_id,
      status: 'running',
      current_step: 0,
      total_steps: 3,
      started_at: admin.firestore.FieldValue.serverTimestamp(),
      trigger_data: {},
      context: { business_id },
      step_results: [],
      errors: [],
    })
    try {
      const docSnap = await db.collection('businesses').doc(business_id).get()
      if (!docSnap.exists()) throw new HttpsError('not-found', 'Business not found')
      let score = 100
      const filingsSnap = await db.collection('filings').where('business_id', '==', business_id).get()
      filingsSnap.forEach((d) => {
        if (d.data().filed_late) score -= 3
      })
      const noticesSnap = await db
        .collection('notices')
        .where('business_id', '==', business_id)
        .where('status', '==', 'pending')
        .get()
      score -= noticesSnap.size * 10
      score = Math.max(0, Math.min(100, score))
      await docSnap.ref.update({
        compliance_score: score,
        compliance_score_updated_at: admin.firestore.FieldValue.serverTimestamp(),
      })
      await executionRef.update({
        status: 'completed',
        completed_at: admin.firestore.FieldValue.serverTimestamp(),
        current_step: 3,
      })
      return { success: true, execution_id: executionRef.id }
    } catch (err) {
      await executionRef.update({
        status: 'failed',
        failed_at: admin.firestore.FieldValue.serverTimestamp(),
        error: err.message,
      })
      throw new HttpsError('internal', err.message)
    }
  }
)
