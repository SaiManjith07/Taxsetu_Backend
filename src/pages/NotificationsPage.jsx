import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import WhatsAppSimulator from '../components/notifications/WhatsAppSimulator'

export default function NotificationsPage() {
  const { user } = useAuth()
  const businessId = user?.uid
  const [messages, setMessages] = useState([])

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    const load = async () => {
      const q = query(
        collection(db, 'notifications'),
        where('business_id', '==', businessId),
        orderBy('created_at', 'desc')
      )
      const snap = await getDocs(q)
      if (cancelled) return
      const list = snap.docs.map((d) => {
        const x = d.data()
        // Default message shape
        let hindi = x.hindi || ''
        let english = x.english || ''
        let type = x.type || 'notification'

        // Decode guardian supplier risk into WhatsApp-style nudge (CA message)
        if (x.type === 'guardian_alert' && x.title === 'Supplier risk') {
          try {
            const body = typeof x.body === 'string' ? JSON.parse(x.body) : x.body || {}
            const suppliers = body.suppliers || []
            if (suppliers.length > 0) {
              const s = suppliers[0]
              const supplierName = s.supplier_name || s.gstin || 'Supplier X'
              const itc = Number(s.itc_at_risk || 0).toLocaleString('en-IN')
              hindi =
                hindi ||
                `सप्लायर ${supplierName} ने अभी तक रिटर्न नहीं दाखिल किया; आपका ₹${itc} का टैक्स क्रेडिट अटका है। जब तक वे फाइल न करें, उनका पेंडिंग इनवॉइस पेमेंट न करें।`
              english =
                english ||
                `Supplier ${supplierName} hasn't filed; your ₹${itc} tax credit is blocked. Don't pay their pending invoice until they file.`
              type = 'supplier_nudge'
            }
          } catch {
            // ignore parse error; fall back to generic
          }
        }

        return {
          id: d.id,
          hindi: hindi || 'नई नोटिफिकेशन प्राप्त हुई है।',
          english: english || (x.title || 'New notification'),
          type,
          sent_at: x.created_at?.toDate?.() || new Date(),
          read: x.read === true,
          audio_url: x.audio_url || null,
        }
      })
      setMessages(list)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [businessId])

  const markRead = (id) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)))
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Notifications</h1>
          <p className="text-text-secondary mt-1">WhatsApp-style alerts from Guardian, Filer, and Watcher</p>
        </div>
      </div>
      <WhatsAppSimulator messages={messages} onMarkRead={markRead} />
    </div>
  )
}
