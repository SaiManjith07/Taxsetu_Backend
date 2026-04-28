import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { GeminiService } from './services/geminiService.js'
import { checkSupplierFiling } from './calculator.js'
import { saveFiling } from './filer.js'

if (!admin.apps.length) admin.initializeApp()
const db = admin.firestore()

/**
 * OCR: process invoice image with Gemini Vision.
 * Request: { imageBase64: string }
 * Response: { invoice_number, invoice_date, supplier_name, supplier_gstin, taxable_amount, gst_rate, gst_amount, total_amount, confidence_scores }
 */
export const processImage = onCall(
  { region: 'asia-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
    const { imageBase64 } = request.data || {}
    if (!imageBase64) throw new HttpsError('invalid-argument', 'imageBase64 required')
    try {
      const result = await GeminiService.extractInvoiceFromImage(imageBase64)
      return result
    } catch (e) {
      throw new HttpsError('internal', e.message || 'OCR failed')
    }
  }
)

/**
 * Parse voice transcript with Gemini.
 * Request: { transcript: string }
 * Response: { transaction_type, party_name, amount, gst_included, date, description }
 */
export const parseTranscript = onCall(
  { region: 'asia-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
    const { transcript } = request.data || {}
    if (!transcript || typeof transcript !== 'string') throw new HttpsError('invalid-argument', 'transcript required')
    try {
      const result = await GeminiService.parseVoiceTranscript(transcript)
      return result
    } catch (e) {
      throw new HttpsError('internal', e.message || 'Parse failed')
    }
  }
)

export { checkSupplierFiling, saveFiling }
export { checkGSTPortalNotices, dailyGuardianCheck } from './guardian.js'
export { generateVoice } from './narrator.js'
export { dailyComplianceCheck, runDailyComplianceForBusiness } from './masterPlanner.js'
