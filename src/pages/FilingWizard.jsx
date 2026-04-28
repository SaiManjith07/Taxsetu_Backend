import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import GSTR1PortalPreview from '../components/filing/GSTR1PortalPreview'
import Button from '../components/ui/Button'
import {
  preFlightChecks,
  startFilingSession,
  submitCaptcha,
  submitOTP,
  fillGSTR3BStream,
  getFilledData,
  submitWithEVC,
  downloadReceipts,
} from '../services/filerAgent'
import { computeNetTax } from '../services/calculatorAgent'
import { buildAndSaveMonthlyReturns } from '../services/returnsAgent'
import { processAutopay, isAutopayEnabled } from '../services/paymentAgent'
import guardianAgent from '../services/guardianAgent'
import { celebrate } from '../services/narratorAgent'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { collection, addDoc, Timestamp } from 'firebase/firestore'
import { app, db } from '../lib/firebase'
import { CheckCircle, Loader2, AlertCircle, Volume2, CreditCard } from 'lucide-react'

const STEPS = ['Ready check', 'Login', 'Returns dashboard', 'Fill GSTR-1', 'Fill GSTR-3B', 'Submit']
const FILER_BASE = import.meta.env.VITE_FILER_SERVICE_URL
// Fallback CAPTCHA when API returns none, so the flow always shows something (user can type DEMO12 to proceed in mock)
const FALLBACK_CAPTCHA_IMAGE = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><rect fill="#1e293b" width="200" height="60"/><text x="100" y="38" fill="#e2e8f0" text-anchor="middle" font-size="22" font-family="monospace">DEMO12</text></svg>'
)

function getCurrentPeriod() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const y = d.getFullYear()
  return `${m}${y}`
}

export default function FilingWizard() {
  const { user, business } = useAuth()
  const businessId = user?.uid
  const period = getCurrentPeriod()
  const [step, setStep] = useState(1)
  const [autopayProcessing, setAutopayProcessing] = useState(false)
  const [autopayResult, setAutopayResult] = useState(null)
  const [ready, setReady] = useState(null)
  const [checks, setChecks] = useState([])
  const [warnings, setWarnings] = useState([])
  const [credentials, setCredentials] = useState({ gstin: '', password: '' })
  const [sessionId, setSessionId] = useState(null)
  const [captchaSubmitted, setCaptchaSubmitted] = useState(false)
  const [captchaImage, setCaptchaImage] = useState(null)
  const [captchaText, setCaptchaText] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [fillingProgress, setFillingProgress] = useState([])
  const [gstr3bData, setGstr3bData] = useState(null)
  const [gstr1Data, setGstr1Data] = useState(null)
  const [gstr2bData, setGstr2bData] = useState(null)
  const [filledData, setFilledData] = useState(null)
  const [evcOtp, setEvcOtp] = useState('')
  const [arn, setArn] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConfirmFile, setShowConfirmFile] = useState(false)
  const [showGstr1Preview, setShowGstr1Preview] = useState(true)
  const [showGstr2bPreview, setShowGstr2bPreview] = useState(false)
  const portalIframeRef = useRef(null)
  const location = useLocation()
  const stateFromCalculator = location.state || {}

  const hasFilerService = !!FILER_BASE && FILER_BASE !== 'https://your-puppeteer-service.onrender.com'

  function getPortalIframeSrc() {
    if (!hasFilerService || !FILER_BASE) return null
    const base = FILER_BASE.replace(/\/$/, '')
    if (step === 2) return captchaSubmitted ? `${base}/mock-otp.html` : `${base}/mock-login.html`
    if (step === 4) return `${base}/mock-gstr1.html`
    if (step >= 5 && step <= 6) return `${base}/mock-gstr3b.html`
    return null
  }

  const filerOrigin = FILER_BASE ? new URL(FILER_BASE).origin : ''

  // Show same CAPTCHA in both Portal view and Login card: set fallback as soon as step 2 (so it's never blank)
  useEffect(() => {
    if (step === 2 && !captchaImage) setCaptchaImage(FALLBACK_CAPTCHA_IMAGE)
  }, [step, captchaImage])

  // Send CAPTCHA + credentials + captcha text to portal iframe so both sides stay in sync
  const sendPortalState = useCallback(() => {
    if (step !== 2 || !portalIframeRef.current?.contentWindow || !filerOrigin) return
    try {
      const payload = {
        source: 'taxsetu-wizard',
        captchaImage: captchaImage || FALLBACK_CAPTCHA_IMAGE,
        gstin: credentials.gstin || '',
        password: credentials.password || '',
        captchaText: captchaText || '',
      }
      portalIframeRef.current.contentWindow.postMessage(payload, filerOrigin)
    } catch (_) {}
  }, [step, captchaImage, credentials.gstin, credentials.password, captchaText, filerOrigin])

  useEffect(() => {
    if (step !== 2 || !filerOrigin) return
    sendPortalState()
    const t1 = setTimeout(sendPortalState, 400)
    const t2 = setTimeout(sendPortalState, 900)
    const t3 = setTimeout(sendPortalState, 1800)
    const t4 = setTimeout(sendPortalState, 3000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [step, sendPortalState, filerOrigin])

  const handleSubmitCaptchaWithValue = useCallback(async (captchaValue) => {
    setError('')
    setLoading(true)
    const isDemoCaptcha = (captchaValue || '').trim().toUpperCase() === 'DEMO12'
    try {
      if (!hasFilerService || isDemoCaptcha) {
        setCaptchaSubmitted(true)
        setCaptchaText('')
        setLoading(false)
        return
      }
      await submitCaptcha(sessionId, captchaValue)
      setCaptchaSubmitted(true)
    } catch (e) {
      if (isDemoCaptcha) {
        setCaptchaSubmitted(true)
        setCaptchaText('')
      } else {
        setError(e.message || 'Invalid CAPTCHA')
      }
    } finally {
      setLoading(false)
    }
  }, [sessionId, hasFilerService])

  const handleSubmitCaptcha = () => handleSubmitCaptchaWithValue(captchaText)

  // When iframe asks for state, reply with CAPTCHA + credentials + captchaText; handle portal input and Login
  useEffect(() => {
    if (!filerOrigin || step !== 2) return
    const onMessage = (event) => {
      if (event.origin !== filerOrigin) return
      const d = event.data
      if (d?.source !== 'mock-login') return
      if (d?.type === 'request-captcha' || d?.type === 'request-credentials') {
        try {
          event.source?.postMessage?.({
            source: 'taxsetu-wizard',
            captchaImage: captchaImage || FALLBACK_CAPTCHA_IMAGE,
            gstin: credentials.gstin || '',
            password: credentials.password || '',
            captchaText: captchaText || '',
          }, event.origin)
        } catch (_) {}
      }
      if (d?.type === 'portal-captcha-input' && typeof d.captcha === 'string') {
        setCaptchaText(d.captcha)
      }
      if (d?.type === 'portal-login') {
        const cap = typeof d.captcha === 'string' ? d.captcha : captchaText
        setCaptchaText(cap)
        setError('')
        if (!cap.trim()) {
          setError('Enter CAPTCHA in the box')
          return
        }
        if (!hasFilerService) {
          setCaptchaSubmitted(true)
          setCaptchaText('')
          return
        }
        if (!sessionId) {
          setError('Start session first using the form above')
          return
        }
        handleSubmitCaptchaWithValue(cap)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [filerOrigin, step, captchaImage, credentials.gstin, credentials.password, captchaText, hasFilerService, sessionId, handleSubmitCaptchaWithValue])

  // Send GSTR-1 to portal iframe at step 4; send GSTR-3B at step 5/6
  useEffect(() => {
    const src = getPortalIframeSrc()
    if (!src || !portalIframeRef.current?.contentWindow) return
    const timer = setTimeout(() => {
      try {
        if (step === 4) {
          portalIframeRef.current?.contentWindow?.postMessage(
            { source: 'taxsetu-wizard', gstr1: gstr1Data || null },
            filerOrigin
          )
        } else if (step >= 5 && step <= 6) {
          portalIframeRef.current?.contentWindow?.postMessage(
            {
              source: 'taxsetu-wizard',
              table_3_1: gstr3bData?.table_3_1 || {},
              table_4: gstr3bData?.table_4 || {},
              table_5: gstr3bData?.table_5 || {},
            },
            filerOrigin
          )
        }
      } catch (_) {}
    }, 800)
    return () => clearTimeout(timer)
  }, [step, gstr1Data, gstr3bData, hasFilerService, FILER_BASE, captchaSubmitted, filerOrigin])

  useEffect(() => {
    if (!arn || !hasFilerService || !portalIframeRef.current?.contentWindow || !filerOrigin) return
    try {
      portalIframeRef.current.contentWindow.postMessage(
        { source: 'taxsetu-wizard', filed: true, arn },
        filerOrigin
      )
    } catch (_) {}
  }, [arn, hasFilerService, filerOrigin])

  // Persist filing to DB and notify Guardian (real user via Cloud Function, demo via Firestore with is_mock)
  const persistFiling = useCallback(async (arnValue) => {
    if (!businessId) return
    const filingPayload = {
      period,
      return_type: 'GSTR-3B',
      arn: arnValue,
      data: gstr3bData ? { table_3_1: gstr3bData.table_3_1, table_4: gstr3bData.table_4, table_5: gstr3bData.table_5 } : null,
    }
    try {
      if (businessId === 'demo') {
        await addDoc(collection(db, 'filings'), {
          business_id: 'demo',
          ...filingPayload,
          status: 'FILED',
          filed_at: Timestamp.now(),
          filed_late: false,
          is_mock: true,
        })
      } else {
        try {
          const fn = getFunctions(app, 'asia-south1')
          const saveFilingFn = httpsCallable(fn, 'saveFiling')
          await saveFilingFn({ business_id: businessId, ...filingPayload })
        } catch (cfErr) {
          // Cloud Function unreachable (timeout / not deployed). Save directly to Firestore so filings still show in Guardian.
          const isTimeout = (cfErr?.message || '').toLowerCase().includes('internal') || (cfErr?.code === 'internal')
          if (isTimeout) {
            console.info('Cloud Function unavailable; saving filing to Firestore instead. Your filing will still appear in Guardian.')
          } else {
            console.warn('Save filing via Cloud Function failed; saving to Firestore:', cfErr?.message || cfErr)
          }
          await addDoc(collection(db, 'filings'), {
            business_id: businessId,
            ...filingPayload,
            status: 'FILED',
            filed_at: Timestamp.now(),
            filed_late: false,
          })
        }
      }
    } catch (saveErr) {
      console.warn('Save filing failed:', saveErr)
    }
    try {
      await guardianAgent.updateComplianceScore(businessId, {
        event: 'on_time_filing',
        return_type: 'GSTR-3B',
        period,
      })
    } catch (_) {}
    try {
      await celebrate(businessId, {
        return_type: 'GSTR-3B',
        period,
        arn: arnValue,
        tax_paid: gstr3bData?.table_5,
        data: gstr3bData,
      })
    } catch (_) {}
  }, [businessId, period, gstr3bData])

  // Listen for ARN from portal iframe so saved ARN always matches the one on screen
  useEffect(() => {
    const handler = (e) => {
      const d = e.data
      if (!d || d.source !== 'gst-portal-mock' || !d.arn) return
      setArn(d.arn)
      setStep(6)
      persistFiling(d.arn)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [persistFiling])

  // Build readable summary of filled GSTR-3B for narrator
  function getFilledSummaryText() {
    const t31 = gstr3bData?.table_3_1 || {}
    const t4 = gstr3bData?.table_4 || {}
    const t5 = gstr3bData?.table_5 || {}
    const fmt = (n) => (n != null && n !== '' ? Number(n).toLocaleString('en-IN') : '0')
    const parts = [
      `Outward taxable value: ${fmt(t31.taxable_value)} rupees.`,
      `CGST: ${fmt(t31.cgst)}. SGST: ${fmt(t31.sgst)}.`,
      `ITC CGST: ${fmt(t4.itc_cgst)}. ITC SGST: ${fmt(t4.itc_sgst)}.`,
      `Net payable: ${fmt(t5.net_payable)} rupees.`,
      'Is this correct? Say yes to confirm and file, or no to edit and try again.',
    ]
    return parts.join(' ')
  }

  const speakConfirm = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const summary = getFilledSummaryText()
      const u = new SpeechSynthesisUtterance(summary)
      u.rate = 0.9
      u.lang = 'en-IN'
      u.onend = () => setShowConfirmFile(true)
      window.speechSynthesis.speak(u)
    } else {
      setShowConfirmFile(true)
    }
  }

  const handleConfirmAndFile = async () => {
    setShowConfirmFile(false)
    await handleSubmitEVC()
  }

  const handleEditInstead = () => {
    setShowConfirmFile(false)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(
        'You can edit the values in the portal form above. When ready, click Verify and file return again to hear the summary and confirm.'
      )
      u.rate = 0.9
      u.lang = 'en-IN'
      window.speechSynthesis.speak(u)
    }
  }

  useEffect(() => {
    if (step !== 1 || !businessId) return
    setLoading(true)
    setError('')
    preFlightChecks(businessId, period, 'GSTR-3B')
      .then((r) => {
        setReady(r.ready)
        setChecks(r.checks || [])
        setWarnings(r.warnings || [])
      })
      .catch(() => {
        setReady(false)
        setChecks([])
      })
      .finally(() => setLoading(false))
  }, [step, businessId, period])

  // Use data passed from Calculator (File now in the portal) or build from invoices
  useEffect(() => {
    const statePeriod = stateFromCalculator.period || period
    if (stateFromCalculator.gstr1 != null) setGstr1Data(stateFromCalculator.gstr1)
    if (stateFromCalculator.gstr3b != null) setGstr3bData(stateFromCalculator.gstr3b)
    if (!businessId || businessId === 'demo') return
    buildAndSaveMonthlyReturns(businessId, statePeriod)
      .then((res) => {
        if (stateFromCalculator.gstr1 == null) setGstr1Data(res.gstr1 || null)
        if (stateFromCalculator.gstr3b == null) setGstr3bData(res.gstr3b || null)
        setGstr2bData(res.gstr2b || null)
      })
      .catch(() => {
        if (stateFromCalculator.gstr1 == null) setGstr1Data(null)
        if (stateFromCalculator.gstr3b == null) setGstr3bData(null)
        setGstr2bData(null)
      })
  }, [businessId, period, stateFromCalculator.period, stateFromCalculator.gstr1, stateFromCalculator.gstr3b])

  const handleStartLogin = async () => {
    setError('')
    setLoading(true)
    try {
      if (!hasFilerService) {
        setSessionId('mock-session-' + Date.now())
        setCaptchaSubmitted(false)
        setCaptchaImage(FALLBACK_CAPTCHA_IMAGE)
        setStep(2)
        setLoading(false)
        return
      }
      const res = await startFilingSession(credentials)
      setSessionId(res.session_id)
      setCaptchaImage(res.captcha_image ? `data:image/png;base64,${res.captcha_image}` : FALLBACK_CAPTCHA_IMAGE)
      setStep(2)
    } catch (e) {
      setError(e.message || 'Failed to start session')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitOtp = async () => {
    const otpStr = otp.join('')
    setError('')
    setLoading(true)
    try {
      if (!hasFilerService) {
        setStep(3)
        setOtp(['', '', '', '', '', ''])
        setLoading(false)
        return
      }
      await submitOTP(sessionId, otpStr)
      setStep(3)
    } catch (e) {
      setError(e.message || 'Invalid OTP')
    } finally {
      setLoading(false)
    }
  }

  const handleFillForm = async () => {
    setError('')
    setFillingProgress([])
    setLoading(true)
    try {
      if (!hasFilerService) {
        setFillingProgress([
          { progress: 20, action: 'Filling Table 3.1' },
          { progress: 50, action: 'Filling Table 4' },
          { progress: 80, action: 'Filling Table 5' },
          { progress: 100, action: 'Form filled' },
        ])
        setStep(6)
        setLoading(false)
        return
      }
      const updates = []
      for await (const u of fillGSTR3BStream(sessionId, gstr3bData)) {
        updates.push(u)
        setFillingProgress([...updates])
      }
      setStep(6)
      const filled = await getFilledData(sessionId)
      setFilledData(filled)
    } catch (e) {
      setError(e.message || 'Fill failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitEVC = async () => {
    setError('')
    setLoading(true)
    try {
      // When mock portal iframe is present, ask it to submit so the ARN we save matches the one on screen
      if (hasFilerService && FILER_BASE && portalIframeRef.current?.contentWindow) {
        try {
          portalIframeRef.current.contentWindow.postMessage(
            { source: 'taxsetu-wizard', triggerSubmit: true },
            new URL(FILER_BASE).origin
          )
        } catch (_) {}
        setLoading(false)
        return
      }

      let arnValue = 'ARN' + Date.now()
      if (!hasFilerService) {
        setArn(arnValue)
        setStep(6)
        await persistFiling(arnValue)
      } else {
        const res = await submitWithEVC(sessionId, evcOtp)
        arnValue = res.arn || 'Filed'
        setArn(arnValue)
        setStep(6)
        await persistFiling(arnValue)
      }
      
      // Process autopay if enabled
      if (isAutopayEnabled(business) && gstr3bData) {
        const netTax = await computeNetTax(businessId, period)
        if (netTax.net_payable > 0) {
          setAutopayProcessing(true)
          try {
            const paymentResult = await processAutopay(
              businessId,
              period,
              netTax.net_payable,
              {
                ...business.bank_account,
                gstin: business.gstin,
              }
            )
            setAutopayResult(paymentResult)
          } catch (payErr) {
            setAutopayResult({ success: false, error: payErr.message })
          } finally {
            setAutopayProcessing(false)
          }
        }
      }
    } catch (e) {
      setError(e.message || 'EVC failed')
    } finally {
      setLoading(false)
    }
  }

  const setOtpDigit = (index, value) => {
    if (value.length > 1) value = value.slice(-1)
    const next = [...otp]
    next[index] = value
    setOtp(next)
    if (value && index < 5) document.getElementById(`otp-${index + 1}`)?.focus()
  }

  const portalSrc = getPortalIframeSrc()

  const fromNotice = stateFromCalculator.fromNotice === true
  const noticeFormToFile = stateFromCalculator.formToFile || 'DRC-03'
  const noticeNumber = stateFromCalculator.noticeNumber || ''

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">रिटर्न फाइल करें / File Return</h1>
        <p className="text-text-secondary mt-1">5-step filing wizard with verification</p>
      </div>

      {fromNotice && (
        <div className="p-4 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-100">
          <p className="text-sm font-medium">
            Replying to notice {noticeNumber ? `${noticeNumber} – ` : ''}file form {noticeFormToFile} on the GST portal.
          </p>
          <p className="text-xs text-text-secondary mt-1">
            नोटिस का जवाब – GST पोर्टल पर फॉर्म {noticeFormToFile} फाइल करें। Complete the steps below to login and file your reply.
          </p>
        </div>
      )}

      {portalSrc && (
        <Card>
          <CardHeader title="Portal view" subtitle="Mock GST portal (same screen)" />
          <CardContent className="p-0">
            <iframe
              ref={portalIframeRef}
              src={portalSrc}
              title="GST Portal"
              className="w-full h-[420px] rounded-b-lg border-0 bg-[#020617]"
              sandbox="allow-scripts allow-same-origin allow-forms"
              onLoad={() => {
                if (step === 2 && portalIframeRef.current?.contentWindow && filerOrigin) {
                  try {
                    const payload = {
                      source: 'taxsetu-wizard',
                      captchaImage: captchaImage || FALLBACK_CAPTCHA_IMAGE,
                      gstin: credentials.gstin || '',
                      password: credentials.password || '',
                      captchaText: captchaText || '',
                    }
                    portalIframeRef.current.contentWindow.postMessage(payload, filerOrigin)
                  } catch (_) {}
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`px-3 py-1 rounded-full text-sm ${
              step > i + 1 ? 'bg-success/20 text-success' : step === i + 1 ? 'bg-primary text-white' : 'bg-white/10 text-text-secondary'
            }`}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Step 1: Ready check */}
      {step === 1 && (
        <Card>
          <CardHeader title="Pre-flight check" subtitle="Ensure everything is ready" />
          <CardContent>
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            ) : (
              <>
                <ul className="space-y-2 mb-4">
                  {checks.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      {c.pass ? <CheckCircle className="w-4 h-4 text-success" /> : <AlertCircle className="w-4 h-4 text-danger" />}
                      {c.name}
                    </li>
                  ))}
                </ul>
                {warnings.length > 0 && (
                  <p className="text-warning text-sm mb-4">{warnings.join(' ')}</p>
                )}
                <Button onClick={() => setStep(2)} disabled={!ready && !hasFilerService}>
                  Continue to Login
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Login - CAPTCHA + OTP (same CAPTCHA visible in Portal view and here) */}
      {step === 2 && (
        <Card>
          <CardHeader title="Login to GST Portal" subtitle="CAPTCHA and OTP" />
          <CardContent className="space-y-4">
            {!sessionId ? (
              <>
                <div className="grid gap-2">
                  <label className="text-sm text-text-secondary">GSTIN</label>
                  <input
                    type="text"
                    value={credentials.gstin}
                    onChange={(e) => setCredentials((c) => ({ ...c, gstin: e.target.value }))}
                    className="input glass rounded-lg px-3 py-2 text-text-primary"
                    placeholder="e.g. 22AAAAA0000A1Z5"
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-text-secondary">Password</label>
                  <input
                    type="password"
                    value={credentials.password}
                    onChange={(e) => setCredentials((c) => ({ ...c, password: e.target.value }))}
                    className="input glass rounded-lg px-3 py-2 text-text-primary"
                    placeholder="Enter portal password"
                    autoComplete="new-password"
                  />
                </div>
                <Button onClick={handleStartLogin} disabled={loading}>Start session</Button>
                <div className="pt-2 border-t border-white/10">
                  <label className="text-sm text-text-secondary block mb-2">CAPTCHA (same as portal)</label>
                  <img src={captchaImage || FALLBACK_CAPTCHA_IMAGE} alt="CAPTCHA" className="rounded border border-white/20 mb-2 max-h-20" />
                  <input
                    type="text"
                    value={captchaText}
                    onChange={(e) => setCaptchaText(e.target.value)}
                    className="input glass rounded-lg px-3 py-2 text-text-primary w-32"
                    placeholder="e.g. DEMO12"
                    autoComplete="off"
                  />
                  <p className="text-xs text-text-secondary mt-1">Start session above, then enter CAPTCHA and submit here or in the portal.</p>
                </div>
              </>
            ) : !captchaSubmitted ? (
              <div>
                <label className="text-sm text-text-secondary block mb-2">CAPTCHA (same as portal)</label>
                <img src={captchaImage || FALLBACK_CAPTCHA_IMAGE} alt="CAPTCHA" className="rounded border border-white/20 mb-2 max-h-20" />
                <input
                  type="text"
                  value={captchaText}
                  onChange={(e) => setCaptchaText(e.target.value)}
                  className="input glass rounded-lg px-3 py-2 text-text-primary w-32"
                  placeholder="Enter CAPTCHA (e.g. DEMO12 if mock)"
                  autoComplete="off"
                />
                <Button className="ml-2" onClick={handleSubmitCaptcha} disabled={loading}>Submit CAPTCHA</Button>
              </div>
            ) : (
              <div>
                <label className="text-sm text-text-secondary block mb-2">OTP (6 digits)</label>
                <div className="flex gap-2">
                  {otp.map((d, i) => (
                    <input
                      key={i}
                      id={`otp-${i}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={d}
                      onChange={(e) => setOtpDigit(i, e.target.value)}
                      className="w-10 h-10 text-center rounded-lg glass border border-white/20 text-text-primary"
                      autoComplete="off"
                    />
                  ))}
                </div>
                <Button className="mt-3" onClick={handleSubmitOtp} disabled={loading || otp.some((d) => !d)}>Submit OTP</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Returns dashboard – GSTR-1 + GSTR-2B preview, then continue to GSTR-1 fill */}
      {step === 3 && (
        <Card>
          <CardHeader
            title="Returns dashboard / रिटर्न डैशबोर्ड"
            subtitle="Review GSTR-1 and GSTR-2B below, then fill GSTR-1 in the portal and proceed to GSTR-3B."
          />
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="glass rounded-lg p-3 border border-white/10">
                <p className="text-xs text-text-secondary mb-1">GSTR-1 • Outward supplies</p>
                <p className="text-lg font-semibold text-text-primary">
                  ₹{(gstr1Data?.summary?.total_taxable_value || 0).toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  Invoices: {gstr1Data?.summary?.total_invoices || 0}
                </p>
              </div>
              <div className="glass rounded-lg p-3 border border-white/10">
                <p className="text-xs text-text-secondary mb-1">GSTR-2B • ITC statement</p>
                <p className="text-lg font-semibold text-text-primary">
                  ITC eligible: ₹{(gstr2bData?.summary?.itc_eligible || 0).toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  Suppliers: {gstr2bData?.suppliers?.length || 0}
                </p>
              </div>
              <div className="glass rounded-lg p-3 border border-white/10">
                <p className="text-xs text-text-secondary mb-1">GSTR-3B • Monthly return</p>
                <p className="text-lg font-semibold text-text-primary">
                  Net payable: ₹{(gstr3bData?.table_5?.net_payable || 0).toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  Outward taxable: ₹{(gstr3bData?.table_3_1?.taxable_value || 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <p className="text-sm text-text-secondary">
              Period {period}. Review GSTR-1 and GSTR-2B below. We will auto-fill GSTR-1 in the portal first, then GSTR-3B; you complete OTP/CAPTCHA on the portal.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => setShowGstr1Preview((v) => !v)}
              >
                {showGstr1Preview ? 'Hide GSTR-1 preview' : 'Show GSTR-1 preview'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowGstr2bPreview((v) => !v)}
              >
                {showGstr2bPreview ? 'Hide GSTR-2B preview' : 'Show GSTR-2B preview'}
              </Button>
              <Button
                variant="primary"
                onClick={() => setStep(4)}
                disabled={!gstr1Data}
              >
                Continue to GSTR-1 (auto-fill in portal)
              </Button>
            </div>

            {showGstr1Preview && (
              <div className="mt-4">
                <GSTR1PortalPreview
                  gstr1={gstr1Data}
                  business={business}
                  period={period}
                  status="Not Filed"
                  dueDateLabel="Due Date"
                />
              </div>
            )}

            {showGstr2bPreview && gstr2bData && (
              <div className="mt-4 space-y-3">
                <h3 className="text-sm font-semibold text-text-primary">GSTR-2B preview – supplier-wise ITC</h3>
                <div className="overflow-x-auto text-xs sm:text-sm">
                  <table className="w-full border border-white/10">
                    <thead>
                      <tr className="bg-white/5 text-text-secondary">
                        <th className="px-3 py-2 text-left">Supplier GSTIN</th>
                        <th className="px-3 py-2 text-left">Supplier name</th>
                        <th className="px-3 py-2 text-right">Invoices</th>
                        <th className="px-3 py-2 text-right">Taxable value</th>
                        <th className="px-3 py-2 text-right">ITC eligible</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(gstr2bData.suppliers || []).map((row) => (
                        <tr key={row.supplier_gstin} className="border-t border-white/5">
                          <td className="px-3 py-2 font-mono text-xs">{row.supplier_gstin}</td>
                          <td className="px-3 py-2">{row.supplier_name}</td>
                          <td className="px-3 py-2 text-right">{row.invoice_count}</td>
                          <td className="px-3 py-2 text-right font-mono">₹{Number(row.taxable_value || 0).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2 text-right font-mono">₹{Number(row.itc_eligible || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-white/10 bg-white/5">
                        <td className="px-3 py-2 font-semibold text-text-primary" colSpan={3}>
                          Total ITC (eligible / net)
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          ₹{Number(gstr2bData.summary?.itc_eligible || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          ₹{Number(gstr2bData.summary?.itc_net || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Fill GSTR-1 in portal (iframe auto-filled with gstr1 JSON) */}
      {step === 4 && (
        <Card>
          <CardHeader title="Fill GSTR-1" subtitle="Outward supplies – data auto-filled in the portal below. Verify and continue to GSTR-3B." />
          <CardContent className="space-y-4">
            <p className="text-sm text-text-secondary">
              GSTR-1 has been auto-filled from your invoices. Check the portal view below, then continue to fill and file GSTR-3B.
            </p>
            <Button variant="primary" onClick={() => setStep(5)}>
              Continue to GSTR-3B (auto-fill in portal)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Filling GSTR-3B */}
      {step === 5 && (
        <Card>
          <CardHeader title="Filling GSTR-3B" subtitle="Auto-fill from Calculator data" />
          <CardContent>
            <Button onClick={handleFillForm} disabled={loading || !gstr3bData}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Filling…</> : 'Start filling'}
            </Button>
            {fillingProgress.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm text-text-secondary">
                {fillingProgress.map((p, i) => (
                  <li key={i}>{p.progress}% – {p.action}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 6: Verification */}
      {step === 6 && (
        <Card>
          <CardHeader title="Verify data" subtitle="Compare Calculator vs Portal" />
          <CardContent>
            <div className="overflow-x-auto text-sm">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-text-secondary border-b border-white/10">
                    <th className="pb-2 pr-4">Field</th>
                    <th className="pb-2 pr-4">Calculator</th>
                    <th className="pb-2 pr-4">Portal</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4">Table 3.1 Taxable</td>
                    <td className="py-2 pr-4 font-mono">{gstr3bData?.table_3_1?.taxable_value ?? '—'}</td>
                    <td className="py-2 pr-4 font-mono">{filledData?.table_3_1_taxable ?? '—'}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4">Net payable</td>
                    <td className="py-2 pr-4 font-mono">{gstr3bData?.table_5?.net_payable ?? '—'}</td>
                    <td className="py-2 pr-4 font-mono">{filledData?.net_payable ?? '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-text-secondary text-sm mt-4">Confirm data matches, then proceed to submit.</p>
            <Button className="mt-4" onClick={() => setStep(6)}>Proceed to Submit</Button>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Submit + Success */}
      {step === 6 && !arn && (
        <Card>
          <CardHeader title="Submit with EVC" subtitle="Verify, then file with OTP sent to your mobile" />
          <CardContent className="space-y-4">
            <input
              type="text"
              value={evcOtp}
              onChange={(e) => setEvcOtp(e.target.value)}
              placeholder="EVC OTP (e.g. 123456)"
              className="input glass rounded-lg px-3 py-2 text-text-primary w-40"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={speakConfirm}
                disabled={loading || !evcOtp}
                className="inline-flex items-center gap-2"
              >
                <Volume2 className="w-4 h-4" /> Verify & file return
              </Button>
            </div>
            <p className="text-text-secondary text-sm">Narrator will read out your filled figures and ask: is this correct? Yes to file, No to edit and confirm again.</p>
          </CardContent>
        </Card>
      )}

      {showConfirmFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
          <Card className="max-w-md w-full">
            <CardHeader title="Is this correct?" id="confirm-dialog-title" />
            <CardContent className="space-y-4">
              <p className="text-text-secondary">We read out your figures. Are they correct? Confirm to file, or choose to edit and try again.</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={handleEditInstead}>No, let me edit</Button>
                <Button onClick={handleConfirmAndFile} disabled={loading}>Yes, confirm and file</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 6 && arn && (
        <>
          <Card className="border-success/50">
            <CardContent className="py-8 text-center">
              <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
              <h2 className="text-xl font-bold text-text-primary mb-2">Return filed successfully</h2>
              <p className="text-text-secondary mb-2">ARN: <span className="font-mono text-text-primary">{arn}</span></p>
              <p className="text-sm text-text-secondary">Download receipts from the GST portal. Narrator will send a confirmation shortly.</p>
            </CardContent>
          </Card>

          {/* Autopay Processing */}
          {autopayProcessing && (
            <Card className="border-primary/30">
              <CardContent className="py-6">
                <div className="flex items-center gap-4">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <div>
                    <h3 className="font-semibold text-text-primary">Processing Autopay...</h3>
                    <p className="text-sm text-text-secondary">Automatically paying GST from your bank account</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Autopay Result */}
          {autopayResult && !autopayProcessing && (
            <Card className={autopayResult.success ? 'border-green-500/30 bg-green-500/5' : 'border-orange-500/30 bg-orange-500/5'}>
              <CardContent className="py-6">
                <div className="flex items-start gap-4">
                  {autopayResult.success ? (
                    <>
                      <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-text-primary mb-2">✅ Payment Completed</h3>
                        <div className="space-y-1 text-sm text-text-secondary">
                          <p>Amount: ₹{autopayResult.amount?.toLocaleString('en-IN')}</p>
                          <p>Transaction ID: <span className="font-mono">{autopayResult.transaction_id}</span></p>
                          <p>Challan: <span className="font-mono">{autopayResult.challan_number}</span></p>
                          <p>Bank Reference: <span className="font-mono">{autopayResult.bank_reference}</span></p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-8 h-8 text-orange-500 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-text-primary mb-2">⚠️ Payment Failed</h3>
                        <p className="text-sm text-text-secondary">{autopayResult.error || 'Payment could not be processed'}</p>
                        <p className="text-xs text-text-secondary mt-2">Please pay manually through GST portal.</p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
