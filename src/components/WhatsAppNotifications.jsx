import React, { useState, useEffect } from 'react'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Card } from './ui/Card'
import MessageBubble from './notifications/MessageBubble'
import { Play, Pause } from 'lucide-react'

/**
 * WhatsApp-style notification widget. Subscribes to notifications for businessId
 * and renders them with optional browser TTS play.
 */
export default function WhatsAppNotifications({ businessId, maxItems = 8 }) {
  const [messages, setMessages] = useState([])

  useEffect(() => {
    if (!businessId) {
      setMessages([])
      return
    }
    const q = query(
      collection(db, 'notifications'),
      where('business_id', '==', businessId),
      orderBy('created_at', 'desc'),
      limit(maxItems)
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap) => {
        const x = docSnap.data()
        let hindi = x.hindi || ''
        let english = x.english || ''
        let type = x.type || 'notification'

        if (x.type === 'guardian_alert' && x.title === 'Supplier risk') {
          try {
            const body = typeof x.body === 'string' ? JSON.parse(x.body) : x.body || {}
            const suppliers = body.suppliers || []
            if (suppliers.length > 0) {
              const s = suppliers[0]
              const supplierName = s.supplier_name || s.gstin || 'Supplier X'
              const itc = Number(s.itc_at_risk || 0).toLocaleString('en-IN')
              hindi = hindi || `सप्लायर ${supplierName} ने अभी तक रिटर्न नहीं दाखिल किया; आपका ₹${itc} का टैक्स क्रेडिट अटका है। जब तक वे फाइल न करें, उनका पेंडिंग इनवॉइस पेमेंट न करें।`
              english = english || `Supplier ${supplierName} hasn't filed; your ₹${itc} tax credit is blocked. Don't pay their pending invoice until they file.`
              type = 'supplier_nudge'
            }
          } catch (_) {}
        }

        return {
          id: docSnap.id,
          hindi: hindi || 'नई सूचना।',
          english: english || (x.title_english || x.title || 'Update'),
          type,
          sent_at: x.created_at?.toDate?.() || new Date(),
          read: x.read === true,
          audio_url: x.audio_url || null,
          tts_text: x.tts_text || x.hindi || x.english,
          audio_duration: x.audio_duration || null,
        }
      })
      setMessages(list)
    })
    return () => unsubscribe()
  }, [businessId, maxItems])

  return (
    <Card className="max-w-md overflow-hidden">
      <div className="bg-secondary/30 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center text-white font-bold">
          TS
        </div>
        <div>
          <p className="font-medium text-text-primary">TaxSetu</p>
          <p className="text-xs text-text-secondary">GST Compliance Bot</p>
        </div>
      </div>
      <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto bg-background/50">
        {messages.length === 0 && (
          <p className="text-sm text-text-secondary text-center py-4">No notifications yet.</p>
        )}
        {messages.map((m) => (
          <MessageBubbleWithPlay
            key={m.id}
            hindi={m.hindi}
            english={m.english}
            type={m.type}
            read={m.read}
            audioUrl={m.audio_url}
            ttsText={m.tts_text}
            audioDuration={m.audio_duration}
          />
        ))}
      </div>
    </Card>
  )
}

function MessageBubbleWithPlay({ hindi, english, type, read, audioUrl, ttsText, audioDuration }) {
  const [playing, setPlaying] = useState(false)

  const handlePlay = () => {
    if (playing) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
      setPlaying(false)
      return
    }
    if (audioUrl) {
      const audio = new Audio(audioUrl)
      audio.play()
      setPlaying(true)
      audio.onended = () => setPlaying(false)
      return
    }
    if (ttsText && typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(ttsText)
      u.lang = 'hi-IN'
      u.rate = 0.95
      u.onend = () => setPlaying(false)
      window.speechSynthesis.speak(u)
      setPlaying(true)
    }
  }

  const canPlay = !!(audioUrl || ttsText)
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg rounded-br-md bg-success/90 px-4 py-2.5 text-left shadow">
        <p className="text-white text-sm leading-relaxed">{hindi}</p>
        <p className="text-white/80 text-xs mt-1">{english}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-white/60">{type?.replace(/_/g, ' ')}</span>
          {canPlay ? (
            <button
              type="button"
              onClick={handlePlay}
              className="p-1.5 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center gap-1"
              title={playing ? 'Stop' : 'Play'}
            >
              {playing ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {audioDuration != null && audioDuration > 0 && !playing && (
                <span className="text-xs">{formatDuration(audioDuration)}</span>
              )}
            </button>
          ) : (
            <span className="text-xs">{read ? '✓✓' : '✓'}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
