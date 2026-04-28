import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import Button from '../components/ui/Button'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import guardianAgent from '../services/guardianAgent'
import { getRulesAppliedForPeriod } from '../services/calculatorAgent'

function getScoreColor(score) {
  if (score >= 90) return 'text-green-500'
  if (score >= 75) return 'text-yellow-500'
  if (score >= 60) return 'text-orange-500'
  return 'text-red-500'
}

function getScoreLabel(score) {
  if (score >= 90) return { hindi: 'उत्तम', english: 'Excellent' }
  if (score >= 75) return { hindi: 'अच्छा', english: 'Good' }
  if (score >= 60) return { hindi: 'ठीक', english: 'Fair' }
  return { hindi: 'सुधार चाहिए', english: 'Needs Improvement' }
}

function ComplianceScoreCard({ score, onViewHistory, loading, stats }) {
  const hasScore = score != null && !loading
  const color = hasScore ? getScoreColor(score) : 'text-text-secondary'
  const label = hasScore ? getScoreLabel(score) : { hindi: '—', english: '—' }

  return (
    <Card className="border-primary/20">
      <CardContent className="py-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div
            className={`w-28 h-28 rounded-full border-4 flex flex-col items-center justify-center flex-shrink-0 border-primary/50 ${hasScore ? color : 'text-text-secondary'}`}
          >
            {loading ? (
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            ) : score != null ? (
              <>
                <span className="text-3xl font-bold">{score}</span>
                <span className="text-sm text-text-secondary">/100</span>
              </>
            ) : (
              <span className="text-2xl text-text-secondary">—</span>
            )}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              🛡️ Compliance Score / कंप्लायंस स्कोर
            </h3>
            <p className={`font-medium ${color}`}>
              {label.hindi} / {label.english}
            </p>
            {hasScore && (
              <p className="text-sm text-text-secondary mt-2">
                आपका compliance record {score >= 90 ? 'बहुत बढ़िया' : 'सुधार योग्य'} है।
              </p>
            )}
            {stats && (stats.filingsCount > 0 || stats.pendingNotices > 0 || stats.invoicesCount > 0) && (
              <p className="text-xs text-text-secondary mt-2">
                Based on your data: {stats.filingsCount} filing(s), {stats.invoicesCount} invoice(s), {stats.pendingNotices} pending notice(s).
              </p>
            )}
            {onViewHistory && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onViewHistory}
              >
                इतिहास देखें / View History
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const DEFAULT_DOCUMENTS_TO_CHECK = [
  'Purchase invoices for the notice period',
  'GSTR-2B for the period (download from GST portal)',
  'Your GSTR-3B copy for the period',
  'Supplier GSTIN list and their filing status',
  'Bank statement or payment proof if differential tax paid',
]
const DEFAULT_DOCUMENTS_REQUIRED_TO_FILE = [
  'DRC-03 reply form (on GST portal)',
  'Reconciliation statement (claimed vs available ITC)',
  'Payment challan (if tax paid)',
  'Supporting invoice copies and GSTR-2B extract',
]

function NoticeCard({ notice }) {
  const [expanded, setExpanded] = useState(false)
  const [showActionPlan, setShowActionPlan] = useState(false)
  const [showReply, setShowReply] = useState(false)
  const navigate = useNavigate()
  const analysis = notice.analysis || {}
  const details = analysis.details || {}
  const actionPlan = notice.action_plan || {}
  const formToFile = actionPlan.form_to_file || (notice.notice_type === 'mismatch' || (analysis.notice_type === 'mismatch') ? 'DRC-03' : null)
  const redirectToFiler = actionPlan.redirect_to_filer !== false && formToFile

  const isLegacyNotice = (analysis.issue_summary || '').includes('unavailable') || (analysis.issue_summary || '').includes('Gemini API')
  const claimed = details.claimed_amount != null ? details.claimed_amount : 50000
  const available = details.available_amount != null ? details.available_amount : 45000
  const diff = details.difference != null ? details.difference : claimed - available
  const fallbackSummary = isLegacyNotice
    ? `ITC mismatch: You claimed ₹${Number(claimed).toLocaleString('en-IN')} in GSTR-3B but only ₹${Number(available).toLocaleString('en-IN')} was available in GSTR-2B (difference ₹${Number(diff).toLocaleString('en-IN')}). Reconcile with GSTR-2B, pay if liable, and file reply in DRC-03 before the deadline.`
    : null
  const fallbackReason = isLegacyNotice
    ? 'The department has identified that your claimed ITC exceeds the amount in GSTR-2B. Common causes: supplier not filed, timing mismatch, or data error. Reconcile your books with GSTR-2B, pay the shortfall if liable, and file a reply in DRC-03 form.'
    : null
  const displaySummary = fallbackSummary || analysis.issue_summary
  const displayReason = analysis.reason_for_itc_reversal || fallbackReason
  const documentsToCheck = actionPlan.documents_to_check || DEFAULT_DOCUMENTS_TO_CHECK
  const documentsRequiredToFile = actionPlan.documents_required_to_file || DEFAULT_DOCUMENTS_REQUIRED_TO_FILE

  return (
    <Card className={`border-l-4 ${
      notice.severity === 'critical' ? 'border-red-500' :
      notice.severity === 'high' ? 'border-orange-500' :
      notice.severity === 'medium' ? 'border-yellow-500' : 'border-green-500'
    }`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h4 className="font-semibold text-text-primary capitalize">
                {notice.notice_type || analysis.notice_type || 'Notice'}
              </h4>
              <p className="text-sm text-text-secondary font-mono">{notice.notice_number}</p>
            </div>
          </div>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
              notice.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
              notice.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
              notice.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-green-500/20 text-green-400'
            }`}
          >
            {notice.severity}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {analysis.issue_summary_hindi && !isLegacyNotice && (
            <p className="text-sm text-text-secondary">{analysis.issue_summary_hindi}</p>
          )}
          {displaySummary && (
            <p className="text-sm text-text-primary">{displaySummary}</p>
          )}
          {displayReason && (
            <div className="mt-3 p-3 bg-white/5 rounded-lg border border-white/10">
              <h5 className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Analyzed reason for ITC reversal / आईटीसी रिवर्सल का विश्लेषण</h5>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{displayReason}</p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-secondary">
          {notice.deadline && (
            <span>📅 Deadline: {notice.deadline}</span>
          )}
          {details.difference != null && (
            <span>💰 Amount: ₹{Number(details.difference).toLocaleString('en-IN')}</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowActionPlan(!showActionPlan)}
          >
            {showActionPlan ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
            एक्शन प्लान देखें / View Action Plan
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReply(!showReply)}
          >
            रिप्लाई ड्राफ्ट / Reply Draft
          </Button>
        </div>

        {showActionPlan && actionPlan && (
          <div className="mt-4 p-4 bg-white/5 rounded-lg space-y-4">
            <h5 className="text-sm font-semibold text-text-primary">Detailed action plan / विस्तृत एक्शन प्लान</h5>
            <div className="space-y-2">
              <h6 className="text-xs font-medium text-primary">English</h6>
              {(actionPlan.steps_english || []).map((s, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-primary">Step {s.step}:</span> {s.action}
                  {s.why && <p className="text-text-secondary mt-0.5 ml-4">{s.why}</p>}
                </div>
              ))}
            </div>
            {(actionPlan.steps_hindi || []).length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <h6 className="text-xs font-medium text-primary">हिंदी</h6>
                {(actionPlan.steps_hindi || []).map((s, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium text-primary">Step {s.step}:</span> {s.action}
                    {s.why && <p className="text-text-secondary mt-0.5 ml-4">{s.why}</p>}
                  </div>
                ))}
              </div>
            )}
            {(actionPlan.contact_ca_if_unable || actionPlan.contact_ca_if_unable_hindi) && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-sm text-amber-200">{actionPlan.contact_ca_if_unable}</p>
                {actionPlan.contact_ca_if_unable_hindi && (
                  <p className="text-sm text-text-secondary mt-1">{actionPlan.contact_ca_if_unable_hindi}</p>
                )}
              </div>
            )}
            {actionPlan.estimated_time && (
              <p className="text-xs text-text-secondary">Estimated time: {actionPlan.estimated_time}. {actionPlan.estimated_cost && actionPlan.estimated_cost}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
              <div>
                <h6 className="text-xs font-semibold text-primary mb-2">Documents to check / जाँच के लिए दस्तावेज़</h6>
                <ul className="text-sm text-text-secondary space-y-1 list-disc list-inside">
                  {documentsToCheck.map((doc, i) => (
                    <li key={i}>{doc}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h6 className="text-xs font-semibold text-primary mb-2">Required to file reply (DRC-03) / फाइल करने के लिए ज़रूरी</h6>
                <ul className="text-sm text-text-secondary space-y-1 list-disc list-inside">
                  {documentsRequiredToFile.map((doc, i) => (
                    <li key={i}>{doc}</li>
                  ))}
                </ul>
              </div>
            </div>
            {(actionPlan.documents_to_check_hindi || actionPlan.documents_required_to_file_hindi) && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                {actionPlan.documents_to_check_hindi?.length > 0 && (
                  <p className="text-xs text-text-secondary"><span className="font-medium text-primary">हिंदी – जाँच:</span> {actionPlan.documents_to_check_hindi.join('; ')}</p>
                )}
                {actionPlan.documents_required_to_file_hindi?.length > 0 && (
                  <p className="text-xs text-text-secondary"><span className="font-medium text-primary">हिंदी – फाइल:</span> {actionPlan.documents_required_to_file_hindi.join('; ')}</p>
                )}
              </div>
            )}
            {redirectToFiler && formToFile && (
              <Button
                variant="primary"
                size="sm"
                className="mt-2"
                onClick={() => navigate('/filing/start', { state: { fromNotice: true, noticeId: notice.id, noticeNumber: notice.notice_number, formToFile } })}
              >
                <FileText className="w-4 h-4 mr-2" />
                File reply ({formToFile}) / फाइल करें
              </Button>
            )}
          </div>
        )}

        {showReply && notice.reply_draft && (
          <div className="mt-4 p-4 bg-white/5 rounded-lg space-y-2">
            <h5 className="text-sm font-semibold text-text-primary">{notice.reply_draft.subject}</h5>
            <pre className="text-xs text-text-secondary whitespace-pre-wrap font-sans">
              {notice.reply_draft.body}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function NoticesSection({ notices, loading }) {
  return (
    <Card>
      <CardHeader
        title="📨 Notices & Alerts / नोटिस और अलर्ट"
        subtitle="GST portal notices and compliance alerts"
      />
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : notices.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-text-primary font-medium">🎉 कोई पेंडिंग नोटिस नहीं!</p>
            <p className="text-sm text-text-secondary mt-1">No pending notices!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notices.map((notice) => (
              <NoticeCard key={notice.id} notice={notice} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RisksSection({ risks }) {
  if (!risks || risks.length === 0) return null
  return (
    <Card>
      <CardHeader
        title="⚠️ Risk Alerts / जोखिम अलर्ट"
        subtitle="Items that may need attention"
      />
      <CardContent>
        <ul className="space-y-2">
          {risks.map((r, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-text-secondary">
              <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
              {r.message || r}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function ActionItemsSection({ onCheckNotices, onSimulateNotice, onCheckSuppliers, checking, simulating, checkingSuppliers }) {
  return (
    <Card>
      <CardHeader
        title="Actions / एक्शन"
        subtitle="Manual checks and updates"
      />
      <CardContent className="space-y-3">
        <Button
          variant="primary"
          onClick={onCheckNotices}
          disabled={checking || simulating || checkingSuppliers}
        >
          {checking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Checking...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Check portal for notices / पोर्टल चेक करें
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={onSimulateNotice}
          disabled={checking || simulating || checkingSuppliers}
          title="Inject 1 sample notice and run full pipeline (Gemini analysis, action plan, reply draft). Use for E2E testing."
        >
          {simulating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Processing...
            </>
          ) : (
            <>Simulate 1 notice (E2E test)</>
          )}
        </Button>
        {onCheckSuppliers && (
          <Button
            variant="outline"
            onClick={onCheckSuppliers}
            disabled={checking || simulating || checkingSuppliers}
            title="Check if your suppliers have filed returns; ITC at risk if not."
          >
            {checkingSuppliers ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Checking suppliers...
              </>
            ) : (
              <>Check supplier filings / सप्लायर फाइलिंग चेक करें</>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default function GuardianDashboard() {
  const { user, business } = useAuth()
  const businessId = user?.uid
  const [complianceScore, setComplianceScore] = useState(null)
  const [notices, setNotices] = useState([])
  const [risks, setRisks] = useState([])
  const [stats, setStats] = useState({ filingsCount: 0, invoicesCount: 0, pendingNotices: 0 })
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [checkingSuppliers, setCheckingSuppliers] = useState(false)
  const [scoreLoading, setScoreLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState([])
  const [rulesApplied, setRulesApplied] = useState(null)
  const [rulesLoading, setRulesLoading] = useState(false)

  function getCurrentPeriod() {
    const d = new Date()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const y = d.getFullYear()
    return `${m}${y}`
  }

  const loadGuardianData = async () => {
    if (!businessId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const isDemo = businessId === 'demo'

      if (!isDemo) {
        const businessRef = doc(db, 'businesses', businessId)
        const businessSnap = await getDoc(businessRef)
        if (businessSnap.exists()) {
          const data = businessSnap.data()
          setHistory(Array.isArray(data.compliance_history) ? data.compliance_history.slice(-10) : [])
        }
      } else {
        setHistory([])
      }

      const noticesQuery = query(
        collection(db, 'notices'),
        where('business_id', '==', businessId),
        where('status', '==', 'pending')
      )
      let noticesList = []
      try {
        const noticesSnap = await getDocs(noticesQuery)
        noticesList = noticesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      } catch (_) {}
      setNotices(noticesList)

      const filingsQuery = query(
        collection(db, 'filings'),
        where('business_id', '==', businessId)
      )
      let filingsCount = 0
      try {
        const filingsSnap = await getDocs(filingsQuery)
        filingsCount = filingsSnap.size
      } catch (_) {}
      const invoicesQuery = query(
        collection(db, 'invoices'),
        where('business_id', '==', businessId)
      )
      let invoicesCount = 0
      try {
        const invoicesSnap = await getDocs(invoicesQuery)
        invoicesCount = invoicesSnap.size
      } catch (_) {}

      setStats({
        filingsCount,
        invoicesCount,
        pendingNotices: noticesList.length,
      })

      setRisks([])

      if (isDemo) {
        setComplianceScore(business?.compliance_score ?? 100)
        setRulesApplied(null)
      } else {
        const score = await guardianAgent.recalculateComplianceScore(businessId)
        setComplianceScore(score)
        setRulesLoading(true)
        try {
          const period = getCurrentPeriod()
          const rulesData = await getRulesAppliedForPeriod(businessId, period)
          setRulesApplied(rulesData)
        } catch (_) {
          setRulesApplied(null)
        } finally {
          setRulesLoading(false)
        }
      }
    } catch (e) {
      console.error('Load guardian data failed:', e)
      setComplianceScore(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGuardianData()
  }, [businessId])

  const handleCheckNotices = async () => {
    if (!businessId || businessId === 'demo') return
    setChecking(true)
    try {
      await guardianAgent.checkPortalForNotices(businessId)
      await loadGuardianData()
    } catch (e) {
      console.error('Check notices failed:', e)
    } finally {
      setChecking(false)
    }
  }

  const handleSimulateNotice = async () => {
    if (!businessId || businessId === 'demo') return
    setSimulating(true)
    try {
      await guardianAgent.checkPortalForNotices(businessId, { testWithSampleNotice: true })
      await loadGuardianData()
    } catch (e) {
      console.error('Simulate notice failed:', e)
    } finally {
      setSimulating(false)
    }
  }

  const handleCheckSuppliers = async () => {
    if (!businessId) return
    setCheckingSuppliers(true)
    try {
      const result = await guardianAgent.checkSupplierFilings(businessId)
      await loadGuardianData()
      if (result.risky_suppliers > 0) {
        if (businessId === 'demo') {
          alert('Simulated: 1 supplier not filed. Check Notifications for the WhatsApp nudge.')
        } else {
          alert(`Found ${result.risky_suppliers} supplier(s) who may not have filed. ITC at risk: ₹${result.total_itc_at_risk?.toLocaleString('en-IN') || 0}. Check Notifications.`)
        }
      } else {
        alert(businessId === 'demo' ? 'Demo: no risky suppliers in this run.' : `All ${result.total_suppliers} supplier(s) filed for the period.`)
      }
    } catch (e) {
      console.error('Check suppliers failed:', e)
    } finally {
      setCheckingSuppliers(false)
    }
  }

  const handleViewHistory = () => {
    setShowHistory(!showHistory)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">🛡️ Guardian / गार्डियन</h1>
        <p className="text-text-secondary mt-1">
          Monitors notices, compliance risk score, and drafts replies
        </p>
      </div>

      <ComplianceScoreCard
        score={complianceScore}
        onViewHistory={handleViewHistory}
        loading={loading}
        stats={stats}
      />

      {showHistory && history.length > 0 && (
        <Card>
          <CardHeader title="Compliance history / कंप्लायंस इतिहास" />
          <CardContent>
            <ul className="space-y-2 text-sm">
              {[...history].reverse().map((h, i) => (
                <li key={i} className="flex justify-between text-text-secondary">
                  <span>{h.event}</span>
                  <span>{h.old_score} → {h.new_score}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <NoticesSection notices={notices} loading={loading} />
      <RisksSection risks={risks} />

      {/* Rules applied (from Calculator Agent) */}
      <Card>
        <CardHeader
          title="Rules applied / लागू नियम"
          subtitle="GST compliance rules applied to your invoices this period (from Calculator)"
        />
        <CardContent>
          {rulesLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          ) : rulesApplied ? (
            <>
              <p className="text-sm text-text-secondary mb-3">{rulesApplied.message}</p>
              <p className="text-xs text-text-secondary mb-2">
                Compliance: {rulesApplied.compliance_score}% · {rulesApplied.total_rules_followed} rule(s) followed
              </p>
              <ul className="space-y-2">
                {(rulesApplied.rules || []).map((r) => (
                  <li key={r.code} className="flex flex-wrap gap-2 text-sm border-b border-white/5 pb-2">
                    <span className="font-medium text-text-primary">{r.name}</span>
                    <span className="text-text-secondary">({r.applied_count}×)</span>
                    <span className="text-xs text-text-secondary">{r.description}</span>
                  </li>
                ))}
              </ul>
              {(rulesApplied.rules || []).length === 0 && (
                <p className="text-text-secondary text-sm">No invoices in this period, or rules not yet computed.</p>
              )}
            </>
          ) : (
            <p className="text-text-secondary text-sm">Rules data unavailable.</p>
          )}
        </CardContent>
      </Card>

      <ActionItemsSection
        onCheckNotices={handleCheckNotices}
        onSimulateNotice={handleSimulateNotice}
        onCheckSuppliers={handleCheckSuppliers}
        checking={checking}
        simulating={simulating}
        checkingSuppliers={checkingSuppliers}
      />
    </div>
  )
}
