/**
 * Guardian Agent - Monitors GST portal for notices, assesses risks, drafts replies.
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  arrayUnion,
  Timestamp,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../lib/firebase'
import { sendAlert } from './narratorAgent'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '')

// Model: gemini-1.5-flash may 404 (deprecated/renamed). Prefer gemini-pro (stable) or set VITE_GEMINI_MODEL.
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-pro'
const GEMINI_MODEL_ALT = 'gemini-1.5-flash'

function getModel(name = GEMINI_MODEL) {
  return genAI.getGenerativeModel({ model: name })
}

// ============================================
// 1. CHECK PORTAL FOR NOTICES (Daily Cron / Manual)
// ============================================
/**
 * @param {string} businessId
 * @param {{ testWithSampleNotice?: boolean }} [options] - Set testWithSampleNotice: true for E2E testing to inject one sample notice
 */
const SAMPLE_NOTICE_EXTRACTED_TEXT = (gstin) => `Notice number: DRC-01A/2025-26
Date: 2025-01-15
GSTIN: ${gstin || '—'}
Period: 012025
Subject: ITC mismatch under Section 16(2)(aa).

Issue: ITC claimed in GSTR-3B for the above period exceeds the amount available in GSTR-2B.
Claimed amount: Rs 50,000. Available amount: Rs 45,000. Difference: Rs 5,000.
Affected supplier GSTINs: 29XXXXX1234X1XX.

You are required to explain the discrepancy or pay the differential tax with interest.
Reply by: 2025-02-15. Penalty may be imposed: Rs 10,000 under Section 73.`

export async function checkPortalForNotices(businessId, options = {}) {
  const businessRef = doc(db, 'businesses', businessId)
  const businessSnap = await getDoc(businessRef)
  if (!businessSnap.exists()) throw new Error('Business not found')
  const business = businessSnap.data()

  try {
    const checkGSTPortalNoticesFn = httpsCallable(functions, 'checkGSTPortalNotices')
    const result = await checkGSTPortalNoticesFn({
      gstin: business.gstin,
      last_check_date: business.last_notice_check || null,
      test_with_sample_notice: options.testWithSampleNotice === true,
    })

    const data = result.data || {}
    const newNotices = data.new_notices || []

    if (newNotices.length > 0) {
      for (const notice of newNotices) {
        await processNotice(businessId, notice)
      }
    }

    await updateDoc(businessRef, {
      last_notice_check: new Date().toISOString(),
    })

    return {
      success: true,
      new_notices_count: newNotices.length,
    }
  } catch (error) {
    // Cloud Function often unavailable (not deployed / timeout). For E2E "Simulate notice", run pipeline client-side.
    if (options.testWithSampleNotice === true) {
      console.warn('checkGSTPortalNotices failed, using client-side simulate:', error?.message || error)
      const sampleNotice = { extracted_text: SAMPLE_NOTICE_EXTRACTED_TEXT(business.gstin) }
      await processNotice(businessId, sampleNotice)
      await updateDoc(businessRef, { last_notice_check: new Date().toISOString() })
      return { success: true, new_notices_count: 1 }
    }
    console.error('Error checking portal:', error)
    throw error
  }
}

// Parse notice text for amounts and deadline when Gemini is unavailable (rule-based fallback).
function parseNoticeTextForStub(text) {
  const t = (text || '').replace(/,/g, '')
  const claimedMatch = t.match(/(?:claimed|claim)\s*(?:amount)?\s*[:\s]*Rs?\s*([\d.]+)/i) || t.match(/Claimed\s*amount:\s*Rs\s*([\d.]+)/i)
  const availableMatch = t.match(/(?:available)\s*(?:amount)?\s*[:\s]*Rs?\s*([\d.]+)/i) || t.match(/Available\s*amount:\s*Rs\s*([\d.]+)/i)
  const diffMatch = t.match(/(?:difference|differential)\s*[:\s]*Rs?\s*([\d.]+)/i) || t.match(/Difference:\s*Rs\s*([\d.]+)/i)
  const periodMatch = t.match(/Period[:\s]*(\d{6})/i) || t.match(/(\d{6})/)
  const deadlineMatch = t.match(/(?:reply by|deadline|by)\s*[:\s]*(\d{4}-\d{2}-\d{2})/i) || t.match(/(\d{4}-\d{2}-\d{2})/g)
  const noticeNumMatch = t.match(/Notice\s*number[:\s]*([^\n]+)/i) || t.match(/(DRC-\d\w*\/[\d-]+)/i)
  const penaltyMatch = t.match(/Penalty[^\d]*(\d+)/i)
  const claimed = claimedMatch ? parseFloat(claimedMatch[1].replace(/\s/g, '')) : 50000
  const available = availableMatch ? parseFloat(availableMatch[1].replace(/\s/g, '')) : 45000
  const difference = diffMatch ? parseFloat(diffMatch[1].replace(/\s/g, '')) : (claimed - available) || 5000
  const period = periodMatch ? periodMatch[1] : ''
  const deadline = Array.isArray(deadlineMatch) ? deadlineMatch[deadlineMatch.length - 1] : (deadlineMatch && deadlineMatch[1]) || null
  const noticeNumber = (noticeNumMatch && (noticeNumMatch[1] || noticeNumMatch[0]).trim()) || 'DRC-01A/2025-26'
  const penalty = penaltyMatch ? parseInt(penaltyMatch[1], 10) : 10000
  return { claimed, available, difference, period, deadline, noticeNumber, penalty }
}

// Stub analysis when Gemini is unavailable: provide analyzed reason and details from parsed notice text.
function stubNoticeAnalysis(extractedText) {
  const parsed = parseNoticeTextForStub(extractedText)
  const claimed = parsed.claimed || 50000
  const available = parsed.available || 45000
  const diff = parsed.difference || 5000
  const issue_summary = `ITC mismatch: You claimed ₹${claimed.toLocaleString('en-IN')} in GSTR-3B but only ₹${available.toLocaleString('en-IN')} was available in GSTR-2B for the period (difference ₹${diff.toLocaleString('en-IN')}). Common causes: (1) Supplier has not filed their return, (2) Timing mismatch between your claim and supplier’s filing date, (3) Incorrect or duplicate claim. You must explain the discrepancy or pay the differential tax with interest and file a reply (DRC-03) on the GST portal.`
  const reason_for_itc_reversal = `The department has identified that the ITC claimed by you for the period exceeds the amount auto-populated from GSTR-2B. Possible reasons for this reversal: (a) Supplier delayed or did not file their GSTR-1/3B, (b) Your claim was made before the supplier’s return was reflected in GSTR-2B, (c) Data entry or reconciliation error. Recommended: Reconcile your books with GSTR-2B, pay the shortfall if liable, and submit a reply in DRC-03 form before the deadline.`
  return {
    notice_number: parsed.noticeNumber,
    notice_type: 'mismatch',
    type: 'mismatch',
    date: new Date().toISOString().slice(0, 10),
    gstin: '',
    period: parsed.period,
    issue_summary,
    issue_summary_hindi: 'आईटीसी असंगति – दावा किया गया राशि GSTR-2B में उपलब्ध राशि से अधिक। आपको जवाब देना होगा या अंतर का टैक्स जमा करना होगा।',
    reason_for_itc_reversal,
    details: { claimed_amount: claimed, available_amount: available, difference: diff },
    deadline: parsed.deadline,
    penalty_mentioned: parsed.penalty,
    action_required: 'Reconcile ITC with GSTR-2B, pay differential tax if liable, and file reply in DRC-03 on GST portal before deadline.',
    severity: 'medium',
    affected_suppliers: [],
    _stub: true,
  }
}

function stubActionPlan() {
  return {
    steps_english: [
      { step: 1, action: 'Gather supporting documents: purchase invoices, GSTR-2B for the period, and your GSTR-3B copy.', why: 'Required to reconcile and justify the ITC claim or identify the error.', deadline: '', difficulty: 'easy' },
      { step: 2, action: 'Reconcile your claimed ITC with GSTR-2B. Identify whether the difference is due to supplier non-filing, timing, or data error.', why: 'You must explain the discrepancy in your reply.', deadline: '', difficulty: 'medium' },
      { step: 3, action: 'If the shortfall is valid: Pay the differential tax plus interest (via GST portal) and keep the payment reference.', why: 'Paying before replying strengthens your response.', deadline: '', difficulty: 'medium' },
      { step: 4, action: 'File your reply using form DRC-03 on the GST portal before the deadline. Attach reconciliation statement and payment proof if paid.', why: 'Mandatory to avoid penalty under Section 73.', deadline: 'As per notice', difficulty: 'medium' },
      { step: 5, action: 'If you are unable to complete these steps or need help with reconciliation, contact a Chartered Accountant (CA) for assistance.', why: 'A CA can help with reconciliation, reply drafting, and filing to avoid penalties.', deadline: '', difficulty: 'easy' },
    ],
    steps_hindi: [
      { step: 1, action: 'दस्तावेज़ इकट्ठा करें: खरीद चालान, उस अवधि का GSTR-2B और आपकी GSTR-3B कॉपी।', why: 'आईटीसी दावे को सत्यापित करने के लिए ज़रूरी।', deadline: '', difficulty: 'easy' },
      { step: 2, action: 'दावा किए गए आईटीसी को GSTR-2B से मिलाएं। पहचानें कि अंतर सप्लायर ने रिटर्न नहीं दिया, टाइमिंग या डेटा गलती से तो नहीं।', why: 'जवाब में असंगति की व्याख्या करनी होगी।', deadline: '', difficulty: 'medium' },
      { step: 3, action: 'अगर कमी सही है: अंतर का टैक्स + ब्याज GST पोर्टल पर जमा करें और पेमेंट रेफरेंस रखें।', why: 'जवाब से पहले भुगतान करने से जवाब मजबूत होता है।', deadline: '', difficulty: 'medium' },
      { step: 4, action: 'डेडलाइन से पहले GST पोर्टल पर DRC-03 फॉर्म से जवाब फाइल करें। रिकॉन्सिलिएशन स्टेटमेंट और भुगतान प्रूफ अटैच करें।', why: 'धारा 73 के तहत जुर्माना से बचने के लिए अनिवार्य।', deadline: 'नोटिस के अनुसार', difficulty: 'medium' },
      { step: 5, action: 'अगर आप ये कदम पूरे नहीं कर पा रहे या मदद चाहिए तो चार्टर्ड अकाउंटेंट (CA) से संपर्क करें।', why: 'CA रिकॉन्सिलिएशन, जवाब लिखने और फाइलिंग में मदद कर सकते हैं।', deadline: '', difficulty: 'easy' },
    ],
    estimated_time: '1–2 weeks',
    estimated_cost: 'Pay differential tax if liable; consult CA if needed.',
    urgency: 'medium',
    contact_ca_if_unable: 'If you are unable to complete these steps, we recommend contacting a Chartered Accountant (CA) for assistance with reconciliation, reply drafting, and filing to avoid penalties.',
    contact_ca_if_unable_hindi: 'अगर आप ये कदम पूरे नहीं कर पा रहे हैं तो जुर्माने से बचने के लिए रिकॉन्सिलिएशन, जवाब और फाइलिंग में मदद के लिए चार्टर्ड अकाउंटेंट (CA) से संपर्क करें।',
    form_to_file: 'DRC-03',
    redirect_to_filer: true,
    documents_to_check: [
      'Purchase invoices for the notice period',
      'GSTR-2B for the period (download from GST portal)',
      'Your GSTR-3B copy for the period',
      'Supplier GSTIN list and their filing status (GSTR-1 / GSTR-3B)',
      'Bank statement or payment proof if you have already paid the differential tax',
    ],
    documents_required_to_file: [
      'DRC-03 reply form (to be filled on GST portal)',
      'Reconciliation statement (claimed ITC vs available in GSTR-2B)',
      'Payment challan (if differential tax and interest have been paid)',
      'Supporting invoice copies and GSTR-2B extract as per notice',
    ],
    documents_to_check_hindi: [
      'नोटिस अवधि के खरीद चालान',
      'उस अवधि का GSTR-2B (GST पोर्टल से डाउनलोड करें)',
      'उस अवधि की आपकी GSTR-3B कॉपी',
      'सप्लायर GSTIN सूची और उनकी फाइलिंग स्थिति',
      'बैंक स्टेटमेंट / भुगतान प्रूफ (अगर टैक्स जमा किया है)',
    ],
    documents_required_to_file_hindi: [
      'DRC-03 जवाब फॉर्म (GST पोर्टल पर भरें)',
      'रिकॉन्सिलिएशन स्टेटमेंट (दावा किया आईटीसी बनाम GSTR-2B)',
      'भुगतान चालान (अगर अंतर का टैक्स जमा किया है)',
      'समर्थन चालान की कॉपियां और GSTR-2B एक्सट्रैक्ट',
    ],
  }
}

function stubReplyDraft() {
  return {
    subject: 'Reply to GST Notice',
    body: 'Dear Sir/Madam, We are in receipt of the notice. We will submit a detailed reply with supporting documents shortly.',
    supporting_documents_needed: ['Invoice copies', 'GSTR-2B', 'Reconciliation statement'],
  }
}

// ============================================
// 2. PROCESS NOTICE (Analyze with Gemini)
// ============================================
export async function processNotice(businessId, noticeData) {
  try {
    const extractedText =
      noticeData.extracted_text ||
      (await extractNoticeText(noticeData.pdf_url || noticeData.image_base64, noticeData))

    let analysis
    let actionPlan
    let replyDraft
    try {
      analysis = await analyzeNoticeWithGemini(extractedText)
      actionPlan = await generateActionPlan(analysis, businessId)
      replyDraft = await draftReply(analysis, businessId)
    } catch (geminiErr) {
      console.warn('Gemini analysis failed, using stub:', geminiErr?.message || geminiErr)
      analysis = stubNoticeAnalysis(extractedText)
      actionPlan = stubActionPlan()
      replyDraft = stubReplyDraft()
    }

    const severity = calculateSeverity(analysis)
    const noticeRecord = {
      business_id: businessId,
      notice_number: analysis.notice_number || 'N/A',
      notice_type: analysis.notice_type || analysis.type || 'unknown',
      notice_date: analysis.date || new Date().toISOString().slice(0, 10),
      deadline: analysis.deadline || null,
      severity: severity.level,
      extracted_text: extractedText,
      analysis,
      action_plan: actionPlan,
      reply_draft: replyDraft,
      status: 'pending',
      created_at: new Date().toISOString(),
      pdf_url: noticeData.pdf_url || null,
    }

    const noticeRef = await addDoc(collection(db, 'notices'), noticeRecord)

    await updateComplianceScore(businessId, {
      event: 'notice_received',
      severity: severity.level,
    })

    await triggerNarratorAlert(businessId, {
      event: 'notice_received',
      notice_id: noticeRef.id,
      notice: noticeRecord,
    })
    try {
      await sendAlert(businessId, {
        event: 'notice_received',
        notice: noticeRecord,
        notice_id: noticeRef.id,
        severity: severity.level,
        action_plan: actionPlan,
      })
    } catch (_) {}

    return { id: noticeRef.id, ...noticeRecord }
  } catch (error) {
    console.error('Error processing notice:', error)
    throw error
  }
}

// ============================================
// 3. EXTRACT TEXT FROM NOTICE (Gemini Vision or stub)
// ============================================
async function extractNoticeText(pdfUrlOrBase64, noticeData) {
  if (noticeData?.extracted_text) return noticeData.extracted_text

  if (typeof pdfUrlOrBase64 === 'string' && pdfUrlOrBase64.startsWith('data:')) {
    const base64 = pdfUrlOrBase64.split(',')[1]
    const mimeMatch = pdfUrlOrBase64.match(/data:([^;]+);/)
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png'
    const model = getModel()
    const result = await model.generateContent([
      'Extract all text from this GST notice document. Return the complete text. Include notice number, date, GSTIN, paragraphs, tables, deadline.',
      {
        inlineData: {
          data: base64,
          mimeType: mimeType.includes('pdf') ? 'image/png' : mimeType,
        },
      },
    ])
    return result.response.text()
  }

  if (pdfUrlOrBase64) {
    const imageData = await convertPDFToImage(pdfUrlOrBase64)
    if (imageData) {
      const model = getModel()
      const result = await model.generateContent([
        'Extract all text from this GST notice. Return complete text: notice number, date, GSTIN, issue, deadline.',
        { inlineData: { data: imageData, mimeType: 'image/png' } },
      ])
      return result.response.text()
    }
  }

  return (
    noticeData?.extracted_text ||
    'Notice number: DRC-01A\nDate: 2025-01-15\nGSTIN: 29ABCDE1234F1Z5\nPeriod: 012025\nIssue: ITC mismatch. Claimed: 50000, Available: 45000, Difference: 5000.\nDeadline: 2025-02-15.\nPenalty: 10000.'
  )
}

async function convertPDFToImage(pdfUrl) {
  try {
    const res = await fetch(pdfUrl, { mode: 'cors' })
    const blob = await res.blob()
    if (blob.type.startsWith('image/')) {
      return await blobToBase64(blob)
    }
  } catch (_) {}
  return null
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result
      if (typeof dataUrl === 'string') resolve(dataUrl.split(',')[1])
      else reject(new Error('Failed to read blob'))
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ============================================
// 4. ANALYZE NOTICE WITH GEMINI
// ============================================
async function analyzeNoticeWithGemini(noticeText) {
  const prompt = `You are a GST compliance expert analyzing a notice from the Indian GST department.

NOTICE TEXT:
${noticeText}

Analyze this notice and return a JSON object with:
{
  "notice_number": "string (e.g., DRC-01A, SCN-123)",
  "notice_type": "string (e.g., mismatch, not_filed, scrutiny, audit)",
  "date": "string (YYYY-MM-DD)",
  "gstin": "string",
  "period": "string (MMYYYY)",
  "issue_summary": "string (brief summary in English)",
  "issue_summary_hindi": "string (brief summary in Hindi)",
  "details": {
    "claimed_amount": number or null,
    "available_amount": number or null,
    "difference": number or null,
    "specific_invoices": ["array of invoice numbers mentioned"] or null
  },
  "deadline": "string (YYYY-MM-DD)" or null,
  "penalty_mentioned": number or null,
  "action_required": "string (what taxpayer must do)",
  "severity": "low | medium | high | critical",
  "affected_suppliers": ["array of GSTINs mentioned"] or [],
  "reason_for_itc_reversal": "string (if ITC mismatch notice: analyzed reason for reversal and what to do; else omit or null)"
}

Return ONLY valid JSON, no markdown.`

  let lastErr
  for (const modelId of [GEMINI_MODEL, GEMINI_MODEL_ALT]) {
    try {
      const model = getModel(modelId)
      const result = await model.generateContent(prompt)
      const responseText = result.response?.text?.() || ''
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      return JSON.parse(cleanedText)
    } catch (e) {
      lastErr = e
      if (e?.message?.includes('404') || e?.message?.includes('not found')) continue
      throw e
    }
  }
  throw lastErr
}

// ============================================
// 5. CALCULATE SEVERITY
// ============================================
function calculateSeverity(analysis) {
  let severityScore = 0
  const typeScores = {
    mismatch: 20,
    not_filed: 30,
    scrutiny: 40,
    audit: 50,
    demand: 60,
    penalty: 70,
  }
  severityScore += typeScores[analysis.notice_type] || typeScores[analysis.type] || 20

  const details = analysis.details || {}
  if (details.difference) {
    if (details.difference > 100000) severityScore += 30
    else if (details.difference > 50000) severityScore += 20
    else if (details.difference > 10000) severityScore += 10
  }

  if (analysis.deadline) {
    const daysLeft = Math.floor(
      (new Date(analysis.deadline) - new Date()) / (1000 * 60 * 60 * 24)
    )
    if (daysLeft < 7) severityScore += 30
    else if (daysLeft < 15) severityScore += 20
    else if (daysLeft < 30) severityScore += 10
  }

  let level
  if (severityScore >= 80) level = 'critical'
  else if (severityScore >= 60) level = 'high'
  else if (severityScore >= 40) level = 'medium'
  else level = 'low'

  return {
    score: severityScore,
    level,
    ca_consultation_recommended: severityScore >= 60,
  }
}

// ============================================
// 6. GENERATE ACTION PLAN
// ============================================
async function generateActionPlan(analysis, businessId) {
  const businessSnap = await getDoc(doc(db, 'businesses', businessId))
  const business = businessSnap.exists() ? businessSnap.data() : {}

  const model = getModel()
  const prompt = `You are a GST compliance advisor helping an MSME owner in India.

NOTICE ANALYSIS:
${JSON.stringify(analysis, null, 2)}

BUSINESS CONTEXT:
- Business: ${business.business_name || 'N/A'}
- GSTIN: ${business.gstin || 'N/A'}
- Monthly turnover: ~₹${business.avg_monthly_turnover || 'unknown'}

Create a step-by-step action plan in both Hindi and English.

Return JSON:
{
  "steps_english": [
    { "step": 1, "action": "string", "why": "string", "deadline": "string", "difficulty": "easy | medium | hard" }
  ],
  "steps_hindi": [
    { "step": 1, "action": "string", "why": "string", "deadline": "string", "difficulty": "easy | medium | hard" }
  ],
  "estimated_time": "string",
  "estimated_cost": "string",
  "urgency": "low | medium | high | critical",
  "contact_ca_if_unable": "string (recommendation to contact a CA if the taxpayer cannot complete the steps)",
  "contact_ca_if_unable_hindi": "string (same in Hindi, optional)",
  "form_to_file": "string (e.g. DRC-03 for replying to DRC-01/DRC-01A, or null)",
  "redirect_to_filer": true
}

Return ONLY valid JSON.`

  const result = await model.generateContent(prompt)
  let responseText = result.response.text()
  const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleanedText)
}

// ============================================
// 7. DRAFT REPLY
// ============================================
async function draftReply(analysis, businessId) {
  const businessSnap = await getDoc(doc(db, 'businesses', businessId))
  const business = businessSnap.exists() ? businessSnap.data() : {}

  const model = getModel()
  const prompt = `You are drafting a formal reply to a GST notice on behalf of an Indian MSME.

NOTICE DETAILS:
${JSON.stringify(analysis, null, 2)}

BUSINESS DETAILS:
- Business Name: ${business.business_name || 'N/A'}
- GSTIN: ${business.gstin || 'N/A'}
- Authorized Signatory: ${business.owner_name || 'N/A'}

Draft a professional, polite reply letter. Return JSON:
{
  "subject": "string",
  "body": "string (complete letter body)",
  "supporting_documents_needed": ["array of documents to attach"],
  "tone": "apologetic | explanatory | assertive",
  "estimated_effectiveness": "low | medium | high"
}

Return ONLY valid JSON.`

  const result = await model.generateContent(prompt)
  let responseText = result.response.text()
  const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleanedText)
}

// ============================================
// 8. UPDATE COMPLIANCE SCORE
// ============================================
export async function updateComplianceScore(businessId, event) {
  try {
    const businessRef = doc(db, 'businesses', businessId)
    const businessSnap = await getDoc(businessRef)
    const business = businessSnap.exists() ? businessSnap.data() : {}
    let currentScore = business.compliance_score ?? 100

    const scoreChanges = {
      notice_received: -10,
      notice_resolved: 5,
      on_time_filing: 0.5,
      late_filing: -3,
      itc_mismatch: -5,
      supplier_risk: -2,
      penalty_paid: -8,
      clean_quarter: 5,
    }
    let change = scoreChanges[event.event] ?? 0

    if (event.severity) {
      const multipliers = { low: 1, medium: 1.5, high: 2, critical: 3 }
      const multiplier = multipliers[event.severity] || 1
      change = change * multiplier
    }
    let newScore = currentScore + change
    newScore = Math.max(0, Math.min(100, Math.round(newScore * 10) / 10))

    const historyEntry = {
      date: new Date().toISOString(),
      event: event.event,
      old_score: currentScore,
      new_score: newScore,
      change: newScore - currentScore,
    }

    await updateDoc(businessRef, {
      compliance_score: newScore,
      compliance_score_updated_at: new Date().toISOString(),
      compliance_history: arrayUnion(historyEntry),
    })

    return { old_score: currentScore, new_score: newScore, change: newScore - currentScore }
  } catch (error) {
    console.error('Error updating compliance score:', error)
    throw error
  }
}

// ============================================
// 9. RECALCULATE FULL COMPLIANCE SCORE
// ============================================
export async function recalculateComplianceScore(businessId) {
  let score = 100
  const businessRef = doc(db, 'businesses', businessId)
  const businessSnap = await getDoc(businessRef)
  if (!businessSnap.exists()) return score

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const filingsQuery = query(
    collection(db, 'filings'),
    where('business_id', '==', businessId)
  )
  const filingsSnapshot = await getDocs(filingsQuery)
  let lateFilings = 0
  let onTimeFilings = 0
  filingsSnapshot.forEach((d) => {
    const filing = d.data()
    if (filing.filed_late) lateFilings++
    else onTimeFilings++
  })
  score += onTimeFilings * 0.5
  score -= lateFilings * 3

  const noticesQuery = query(
    collection(db, 'notices'),
    where('business_id', '==', businessId),
    where('status', '==', 'pending')
  )
  const noticesSnapshot = await getDocs(noticesQuery)
  score -= noticesSnapshot.size * 10

  score = Math.max(0, Math.min(100, score))

  await updateDoc(businessRef, {
    compliance_score: score,
    compliance_score_updated_at: new Date().toISOString(),
  })
  return score
}

// ============================================
// 10. CHECK SUPPLIER FILING STATUS
// ============================================
function getCurrentPeriod() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()
  return `${month}${year}`
}

/** Demo: simulate one supplier not filed so user can see the WhatsApp nudge in Notifications. */
async function simulateSupplierNotFiledDemo(businessId) {
  const riskySuppliers = [
    {
      gstin: '29ABCDE1234X1Z5',
      supplier_name: 'ABC Traders',
      itc_at_risk: 50000,
      days_overdue: 7,
    },
  ]
  await triggerNarratorAlert(businessId, {
    event: 'supplier_risk_detected',
    suppliers: riskySuppliers,
    _simulated: true,
  })
  return {
    total_suppliers: 1,
    risky_suppliers: 1,
    total_itc_at_risk: 50000,
  }
}

export async function checkSupplierFilings(businessId) {
  try {
    if (businessId === 'demo') {
      return await simulateSupplierNotFiledDemo(businessId)
    }

    const period = getCurrentPeriod()
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('business_id', '==', businessId),
      where('type', '==', 'inward')
    )
    const invoicesSnapshot = await getDocs(invoicesQuery)
    const suppliersToCheck = new Set()
    const itcBySupplier = {}
    const supplierNames = {}

    invoicesSnapshot.forEach((d) => {
      const invoice = d.data()
      const invPeriod = invoice.period || period
      if (invPeriod !== period) return
      const gstin = invoice.supplier_gstin || 'UNREGISTERED'
      suppliersToCheck.add(gstin)
      if (!itcBySupplier[gstin]) itcBySupplier[gstin] = 0
      itcBySupplier[gstin] += invoice.itc_amount || 0
      if (invoice.supplier_name) supplierNames[gstin] = invoice.supplier_name
    })

    const checkSupplierFilingFn = httpsCallable(functions, 'checkSupplierFiling')
    const riskySuppliers = []

    for (const supplierGstin of suppliersToCheck) {
      if (!supplierGstin || supplierGstin === 'UNREGISTERED') continue
      try {
        const res = await checkSupplierFilingFn({ supplier_gstin: supplierGstin, period })
        const filed = res?.data?.filed === true
        if (!filed) {
          riskySuppliers.push({
            gstin: supplierGstin,
            supplier_name: supplierNames[supplierGstin] || supplierGstin,
            itc_at_risk: itcBySupplier[supplierGstin] || 0,
            days_overdue: res?.data?.days_overdue ?? 0,
          })
        }
      } catch (_) {
        riskySuppliers.push({
          gstin: supplierGstin,
          supplier_name: supplierNames[supplierGstin] || supplierGstin,
          itc_at_risk: itcBySupplier[supplierGstin] || 0,
          days_overdue: 0,
        })
      }
    }

    if (riskySuppliers.length > 0) {
      await triggerNarratorAlert(businessId, {
        event: 'supplier_risk_detected',
        suppliers: riskySuppliers,
      })
      await updateComplianceScore(businessId, {
        event: 'supplier_risk',
        count: riskySuppliers.length,
      })
    }

    return {
      total_suppliers: suppliersToCheck.size,
      risky_suppliers: riskySuppliers.length,
      total_itc_at_risk: riskySuppliers.reduce((sum, s) => sum + (s.itc_at_risk || 0), 0),
    }
  } catch (error) {
    console.error('Error checking supplier filings:', error)
    throw error
  }
}

async function triggerNarratorAlert(businessId, data) {
  try {
    await addDoc(collection(db, 'notifications'), {
      business_id: businessId,
      type: 'guardian_alert',
      title: data.event === 'notice_received' ? 'New GST Notice' : 'Supplier risk',
      body: JSON.stringify(data),
      read: false,
      created_at: Timestamp.now(),
    })
  } catch (e) {
    console.warn('Narrator/notification stub failed:', e)
  }
}

export default {
  checkPortalForNotices,
  processNotice,
  updateComplianceScore,
  recalculateComplianceScore,
  checkSupplierFilings,
}
