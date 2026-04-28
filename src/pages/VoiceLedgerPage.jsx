import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { parseVoiceTranscript } from '../services/geminiService'
import { normalizeFromVoice, normalizeFromManual, saveNormalizedInvoice } from '../services/watcherAgent'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import VoiceRecorder from '../components/voice/VoiceRecorder'
import TranscriptDisplay from '../components/voice/TranscriptDisplay'
import ParsedDataCard from '../components/voice/ParsedDataCard'
import ManualLedgerEntry from '../components/ledger/ManualLedgerEntry'
import LedgerTable from '../components/voice/LedgerTable'
import { Mic, PenLine, Clock } from 'lucide-react'

const TAB_VOICE = 'voice'
const TAB_MANUAL = 'manual'

export default function VoiceLedgerPage() {
  const { user } = useAuth()
  const businessId = user?.uid
  const [activeTab, setActiveTab] = useState(TAB_VOICE)
  const [transcript, setTranscript] = useState('')
  const [parsed, setParsed] = useState(null)
  const [partyGstin, setPartyGstin] = useState('')
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const [retryCountdown, setRetryCountdown] = useState(0)
  const [voiceType, setVoiceType] = useState('purchase') // 'purchase' | 'sale'

  useEffect(() => {
    if (retryCountdown <= 0) return
    const t = setInterval(() => setRetryCountdown((c) => (c <= 1 ? 0 : c - 1)), 1000)
    return () => clearInterval(t)
  }, [retryCountdown])

  const handleTranscript = useCallback((text) => {
    setTranscript(text)
    setParsed(null)
    setError('')
    setRetryCountdown(0)
  }, [])

  const handleParse = async () => {
    if (!transcript.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await parseVoiceTranscript(transcript)
      setParsed(data)
      setPartyGstin((data.party_gstin || '').trim())
    } catch (e) {
      setError(e.message || 'Parse failed')
      if (e.retryAfterSeconds) setRetryCountdown(e.retryAfterSeconds)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveEntry = async () => {
    if (!parsed) return
    const gstin = (partyGstin || '').trim()
    const normalized = normalizeFromVoice(parsed, { partyGstin: gstin, transcript, transaction_type: voiceType })
    const invDate = normalized.invoice_date instanceof Date ? normalized.invoice_date : new Date(normalized.invoice_date)
    const entry = {
      id: Date.now(),
      ...parsed,
      party_gstin: gstin || parsed.party_gstin || null,
      voice_transcript: transcript,
      language: 'hi',
      verified: true,
      created_at: new Date().toISOString(),
      entry_date: invDate.toISOString().slice(0, 10),
      amount: normalized.total_amount,
      transaction_type: voiceType,
    }
    setEntries((prev) => [...prev, entry])
    setTranscript('')
    setParsed(null)
    setPartyGstin('')
    if (businessId && businessId !== 'demo') {
      try {
        await saveNormalizedInvoice(businessId, normalized, { confidence_score: 85 })
      } catch (e) {
        setError(e.message || 'Failed to save to invoices')
      }
    }
  }

  const handleManualSave = async (entry) => {
    const normalized = normalizeFromManual(entry)
    const invDate = normalized.invoice_date instanceof Date ? normalized.invoice_date : new Date(normalized.invoice_date)
    setEntries((prev) => [...prev, { ...entry, party_gstin: entry.party_gstin || null }])
    if (businessId && businessId !== 'demo') {
      try {
        await saveNormalizedInvoice(businessId, normalized, { confidence_score: 100 })
      } catch (e) {
        setError(e.message || 'Failed to save to invoices')
      }
    }
  }

  useEffect(() => {
    if (!businessId || businessId === 'demo') return
    let cancelled = false
    const q = query(
      collection(db, 'invoices'),
      where('business_id', '==', businessId),
      where('source', '==', 'voice_ledger'),
      orderBy('created_at', 'desc')
    )
    getDocs(q)
      .then((snap) => {
        if (cancelled) return
        const list = snap.docs.map((d) => {
          const x = d.data()
          const created = x.created_at?.toDate?.() || x.created_at
          const invDate = x.invoice_date?.toDate?.() || x.invoice_date
          const dateStr = invDate?.toISOString?.()?.slice(0, 10) || created?.toISOString?.()?.slice(0, 10)
          return {
            id: d.id,
            party_name: x.supplier_name,
            party_gstin: x.supplier_gstin || null,
            amount: x.total_amount,
            transaction_type: x.metadata?.transaction_type || 'purchase',
            gst_included: true,
            date: dateStr,
            entry_date: dateStr,
            created_at: created?.toISOString?.(),
          }
        })
        setEntries(list)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [businessId])

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">eLedger</h1>
        <p className="text-text-secondary mt-1">Add entries by voice or manual entry – like your ledger book.</p>
      </div>

      {/* Tabs: Voice | Manual */}
      <div className="flex gap-1 p-1 rounded-lg glass w-fit">
        <button
          type="button"
          onClick={() => setActiveTab(TAB_VOICE)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === TAB_VOICE ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Mic className="w-4 h-4" /> Voice
        </button>
        <button
          type="button"
          onClick={() => setActiveTab(TAB_MANUAL)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === TAB_MANUAL ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <PenLine className="w-4 h-4" /> Manual entry
        </button>
      </div>

      {activeTab === TAB_VOICE && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-text-secondary">This voice entry is for:</span>
            <div className="inline-flex rounded-lg overflow-hidden border border-white/15">
              <button
                type="button"
                onClick={() => setVoiceType('purchase')}
                className={`px-3 py-1 text-sm font-medium ${
                  voiceType === 'purchase' ? 'bg-primary text-white' : 'bg-transparent text-text-secondary'
                }`}
              >
                Purchase
              </button>
              <button
                type="button"
                onClick={() => setVoiceType('sale')}
                className={`px-3 py-1 text-sm font-medium border-l border-white/15 ${
                  voiceType === 'sale' ? 'bg-primary text-white' : 'bg-transparent text-text-secondary'
                }`}
              >
                Sale
              </button>
            </div>
          </div>
          <VoiceRecorder onTranscript={handleTranscript} />

      {transcript && (
        <Card>
          <CardHeader
            title="Transcript"
            action={
              <Button size="sm" onClick={handleParse} disabled={loading || retryCountdown > 0}>
                {loading ? 'Parsing...' : retryCountdown > 0 ? `Try again in ${retryCountdown}s` : 'Parse with AI'}
              </Button>
            }
          />
          <CardContent>
            <TranscriptDisplay text={transcript} />
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-2 text-danger">
          <p>{error}</p>
          {retryCountdown > 0 && (
            <span className="text-text-secondary text-sm flex items-center gap-1">
              <Clock className="w-4 h-4" /> Retry in {retryCountdown}s
            </span>
          )}
        </div>
      )}

      {parsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ParsedDataCard data={parsed} />
          <Card>
            <CardHeader title="Confirm & save" />
            <CardContent className="space-y-4">
              <Input
                label="Party GSTIN (15 characters)"
                placeholder="e.g. 29ABCDE1234F1Z5"
                value={partyGstin}
                onChange={(e) => setPartyGstin(e.target.value)}
                maxLength={15}
              />
              <Button onClick={handleSaveEntry}>Save to ledger</Button>
            </CardContent>
          </Card>
        </div>
      )}
        </>
      )}

      {activeTab === TAB_MANUAL && <ManualLedgerEntry onSave={handleManualSave} />}

      <LedgerTable entries={entries} />
    </div>
  )
}
