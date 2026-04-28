import { useState, useCallback, useRef, useEffect } from 'react'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { Headphones, Play, Pause, Loader2, Send, Mic } from 'lucide-react'
import WhatsAppNotifications from '../components/WhatsAppNotifications'
import { useAuth } from '../contexts/AuthContext'
import { answerGSTQuestion } from '../services/narratorAgent'

const SpeechRecognitionAPI =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

const LANGUAGES = [
  { code: 'hi', label: 'हिंदी', labelEn: 'Hindi' },
  { code: 'en', label: 'English', labelEn: 'English' },
  { code: 'ta', label: 'தமிழ்', labelEn: 'Tamil' },
  { code: 'te', label: 'తెలుగు', labelEn: 'Telugu' },
]

const LANG_CODES = { hi: 'hi-IN', en: 'en-IN', ta: 'ta-IN', te: 'te-IN' }

const DOUBTS = [
  {
    id: 'itc',
    titleEn: 'What is ITC (Input Tax Credit)?',
    titleHi: 'ITC (इनपुट टैक्स क्रेडिट) क्या है?',
    textEn: 'Input Tax Credit means claiming the GST you paid on purchases against the GST you collect on sales. If you bought goods worth one lakh rupees and paid eighteen thousand GST, you can use that eighteen thousand to reduce your output tax when you sell.',
    textHi: 'इनपुट टैक्स क्रेडिट का मतलब है जो GST आपने खरीद पर दिया, उसे बिक्री पर लगने वाले GST से कटवाना। अगर आपने एक लाख रुपए का माल खरीदा और अठारह हज़ार GST दिया, तो जब आप बेचेंगे तो उस अठारह हज़ार को आउटपुट टैक्स से काट सकते हैं।',
    textTa: 'Input Tax Credit என்பது நீங்கள் வாங்கிய பொருட்களில் செலுத்திய GST ஐ, விற்பனையில் வசூலிக்கும் GST இலிருந்து கழிக்கும் உரிமை. ஒரு லட்சம் ரூபாய் பொருட்கள் வாங்கி பதினெட்டு ஆயிரம் GST செலுத்தினால், விற்கும்போது அந்த பதினெட்டு ஆயிரத்தை output tax இலிருந்து கழிக்கலாம்.',
    textTe: 'Input Tax Credit అంటే మీరు కొనుగోలుపై చెల్లించిన GST ను అమ్మకంపై వసూలు చేసే GST నుండి కల్పించుకోవడం. ఒక లక్ష రూపాయల వస్తువులు కొని పద్దెనిమిది వేల GST చెల్లించినట్లయితే, అమ్మేటప్పుడు ఆ పద్దెనిమిది వేలను output tax నుండి తగ్గించుకోవచ్చు.',
  },
  {
    id: 'gstr3b',
    titleEn: 'When to file GSTR-3B?',
    titleHi: 'GSTR-3B कब फाइल करें?',
    textEn: 'GSTR-3B is filed every month by the 20th of the next month. For example, for January 2025 you must file by 20 February 2025. File on time to avoid late fees and to keep your compliance score high.',
    textHi: 'GSTR-3B हर महीने अगले महीने की 20 तारीख तक फाइल करनी होती है। जैसे जनवरी 2025 के लिए 20 फरवरी 2025 तक फाइल करें। लेट फीस से बचने और कंप्लायंस स्कोर ठीक रखने के लिए समय पर फाइल करें।',
    textTa: 'GSTR-3B ஐ அடுத்த மாதம் 20ம் தேதிக்குள் மாதந்தோறும் தாக்கல் செய்ய வேண்டும். உதாரணம்: ஜனவரி 2025க்கு பிப்ரவரி 20, 2025க்குள் தாக்கல் செய்யுங்கள். தாமத கட்டணம் தவிர்க்கவும், compliance score உயர்வாக வைக்கவும் சரியான நேரத்தில் தாக்கல் செய்யுங்கள்.',
    textTe: 'GSTR-3B నెలకు తర్వాత నెల 20 తేదీకి ముందు దాఖలు చేయాలి. ఉదాహరణ: జనవరి 2025కి ఫిబ్రవరి 20, 2025కి ముందు దాఖలు చేయండి. లేట్ ఫీజ్ నివారించడానికి, compliance score మంచిగా ఉంచడానికి సకాలంలో దాఖలు చేయండి.',
  },
  {
    id: 'supplier',
    titleEn: 'Why is my supplier’s filing important?',
    titleHi: 'सप्लायर की फाइलिंग मेरे लिए क्यों ज़रूरी है?',
    textEn: 'If your supplier does not file their return, the GST portal will not show that purchase in your GSTR-2B. So you cannot claim ITC on that invoice until they file. Do not pay their pending invoice until they have filed their return.',
    textHi: 'अगर आपके सप्लायर ने रिटर्न नहीं दाखिल किया, तो GST पोर्टल पर आपकी GSTR-2B में वह खरीद नहीं दिखेगी। इसलिए जब तक वे फाइल नहीं करेंगे, आप उस चालान पर ITC नहीं ले सकते। जब तक वे रिटर्न फाइल न कर दें, उनका पेंडिंग इनवॉइस पेमेंट न करें।',
    textTa: 'உங்கள் சப்ளையர் தாக்கல் செய்யாவிட்டால், GST போர்டலில் உங்கள் GSTR-2B இல் அந்த கொள்முதல் தெரியாது. எனவே அவர்கள் தாக்கல் செய்யும் வரை அந்த இன்வாய்ஸில் ITC கோர முடியாது. அவர்கள் தாக்கல் செய்யும் வரை நிலுவை இன்வாய்ஸ் செலுத்த வேண்டாம்.',
    textTe: 'మీ సప్లయర్ రిటర్న్ దాఖలు చేయకపోతే, GST పోర్టల్లో మీ GSTR-2B లో ఆ కొనుగోలు కనిపించదు. కాబట్టి వారు దాఖలు చేసే వరకు ఆ ఇన్వాయిస్పై ITC క్లెయిమ్ చేయలేరు. వారు రిటర్న్ దాఖలు చేసే వరకు వారి పెండింగ్ ఇన్వాయిస్ చెల్లించకండి.',
  },
  {
    id: 'notice',
    titleEn: 'I got a GST notice. What should I do?',
    titleHi: 'मुझे GST नोटिस मिली। क्या करूं?',
    textEn: 'Do not panic. Open the Guardian page in TaxSetu. It will show the notice details, a simple explanation, and a suggested reply. You can respond before the deadline mentioned in the notice. If you need help, use the draft reply and get it verified by your CA.',
    textHi: 'घबराएं नहीं। TaxSetu में Guardian पेज खोलें। वहां नोटिस का विवरण, आसान समझ और जवाब का ड्राफ्ट मिलेगा। नोटिस में दी गई तारीख से पहले जवाब दें। ज़रूरत हो तो CA से ड्राफ्ट चेक करवा लें।',
    textTa: 'பயப்பட வேண்டாம். TaxSetu இல் Guardian பக்கத்தைத் திறக்கவும். அங்கு நோட்டீஸ் விவரம், எளிய விளக்கம், பதில் வரைவு கிடைக்கும். நோட்டீஸில் உள்ள காலக்கெடுவுக்கு முன் பதிலளிக்கவும். தேவைப்பட்டால் CA மூலம் வரைவை சரிபார்க்கவும்.',
    textTe: 'భయపడకండి. TaxSetu లో Guardian పేజీ తెరవండి. అక్కడ నోటీస్ వివరాలు, సాధారణ వివరణ, జవాబు డ్రాఫ్ట్ ఉంటాయి. నోటీస్లో ఇచ్చిన డెడ్‌లైన్ కి ముందు జవాబు ఇవ్వండి. అవసరమైతే CA ద్వారా డ్రాఫ్ట్ వెరిఫై చేయించండి.',
  },
]

function getDoubtText(doubt, lang) {
  if (lang === 'en') return doubt.textEn
  if (lang === 'hi') return doubt.textHi
  if (lang === 'ta') return doubt.textTa
  if (lang === 'te') return doubt.textTe
  return doubt.textEn
}

function getDoubtTitle(doubt, lang) {
  if (lang === 'hi') return doubt.titleHi
  return doubt.titleEn
}

export default function NarratorPage() {
  const { user, business } = useAuth()
  const businessId = user?.uid
  const [language, setLanguage] = useState(business?.settings?.preferred_language || 'hi')
  const [playingId, setPlayingId] = useState(null)
  const [utterance, setUtterance] = useState(null)
  const [userQuestion, setUserQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [lastAnswer, setLastAnswer] = useState(null)
  const [answerPlaying, setAnswerPlaying] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null
          recognitionRef.current.onerror = null
          recognitionRef.current.onend = null
          recognitionRef.current.stop()
        } catch (_) {}
      }
    }
  }, [])

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setPlayingId(null)
    setUtterance(null)
  }, [])

  const speak = useCallback(
    (text, id) => {
      if (!text || typeof window === 'undefined' || !window.speechSynthesis) return
      stopSpeaking()
      const langCode = LANG_CODES[language] || 'hi-IN'
      const u = new SpeechSynthesisUtterance(text)
      u.lang = langCode
      u.rate = 0.9
      u.onend = () => setPlayingId(null)
      u.onerror = () => setPlayingId(null)
      setUtterance(u)
      setPlayingId(id)
      window.speechSynthesis.speak(u)
    },
    [language, stopSpeaking]
  )

  const handlePlay = (doubt) => {
    const id = doubt.id
    if (playingId === id) {
      stopSpeaking()
      return
    }
    const text = getDoubtText(doubt, language)
    speak(text, id)
  }

  const startVoiceInput = useCallback(() => {
    if (!SpeechRecognitionAPI || asking) return
    stopSpeaking()
    const Recognition = SpeechRecognitionAPI
    const recognition = new Recognition()
    recognition.lang = LANG_CODES[language] || 'hi-IN'
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1]
      if (!result.isFinal) return
      const transcript = (result[0] && result[0].transcript) || ''
      if (transcript.trim()) {
        setUserQuestion((prev) => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()))
      }
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }, [language, asking, stopSpeaking])

  const stopVoiceInput = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (_) {}
    }
    setListening(false)
  }, [])

  const handleAsk = async () => {
    const q = userQuestion.trim()
    if (!q || asking) return
    setAsking(true)
    setLastAnswer(null)
    if (listening) stopVoiceInput()
    try {
      const { answer } = await answerGSTQuestion(q, language)
      setLastAnswer({ question: q, answer })
      setAnswerPlaying(true)
      stopSpeaking()
      if (typeof window !== 'undefined' && window.speechSynthesis && answer) {
        const u = new SpeechSynthesisUtterance(answer)
        u.lang = LANG_CODES[language] || 'hi-IN'
        u.rate = 0.9
        u.onend = () => setAnswerPlaying(false)
        u.onerror = () => setAnswerPlaying(false)
        window.speechSynthesis.speak(u)
      }
    } catch (_) {
      setLastAnswer({
        question: q,
        answer: language === 'hi' ? 'जवाब लोड नहीं हो सका।' : 'Could not load answer.',
      })
    } finally {
      setAsking(false)
    }
  }

  const playAnswer = () => {
    if (!lastAnswer?.answer) return
    if (answerPlaying) {
      stopSpeaking()
      setAnswerPlaying(false)
      return
    }
    stopSpeaking()
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(lastAnswer.answer)
      u.lang = LANG_CODES[language] || 'hi-IN'
      u.rate = 0.9
      u.onend = () => setAnswerPlaying(false)
      u.onerror = () => setAnswerPlaying(false)
      window.speechSynthesis.speak(u)
      setAnswerPlaying(true)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/20">
          <Headphones className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Narrator / नैरेटर</h1>
          <p className="text-text-secondary mt-1">
            Voice assistance in your language for GST doubts. Tap any topic to hear an explanation.
          </p>
          <p className="text-sm text-text-secondary mt-0.5">
            आपकी भाषा में आवाज़ सहायता। किसी भी सवाल पर टैप करके सुनें।
          </p>
        </div>
      </div>

      <Card>
        <CardHeader title="Ask your question / अपना सवाल पूछें" />
        <CardContent className="space-y-3">
          <p className="text-sm text-text-secondary">
            Type or speak your GST-related question. Answer will be shown and spoken in your selected language.
          </p>
          <p className="text-xs text-text-secondary">
            {language === 'hi' ? 'टाइप करें या माइक पर क्लिक करके बोलें।' : 'Type or click mic to speak.'}
          </p>
          <div className="flex gap-2 items-end">
            <div className="flex-1 flex gap-2">
              <textarea
                value={userQuestion}
                onChange={(e) => setUserQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAsk())}
                placeholder={language === 'hi' ? 'जैसे: ITC कब क्लेम कर सकते हैं?' : 'e.g. When can I claim ITC?'}
                className="flex-1 min-h-[80px] px-3 py-2 rounded-lg border border-border bg-background text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                disabled={asking}
                rows={2}
              />
              {SpeechRecognitionAPI ? (
                <button
                  type="button"
                  onClick={listening ? stopVoiceInput : startVoiceInput}
                  disabled={asking}
                  className={`p-3 rounded-lg shrink-0 self-end flex items-center justify-center ${
                    listening
                      ? 'bg-red-500/20 text-red-400 animate-pulse'
                      : 'bg-primary/20 text-primary hover:bg-primary/30'
                  }`}
                  title={listening ? (language === 'hi' ? 'रोकें' : 'Stop') : (language === 'hi' ? 'बोलें' : 'Speak')}
                >
                  <Mic className="w-6 h-6" />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleAsk}
              disabled={asking || !userQuestion.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0 self-end"
            >
              {asking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {asking ? (language === 'hi' ? 'जवाब आ रहा...' : 'Getting answer...') : (language === 'hi' ? 'पूछें' : 'Ask')}
            </button>
          </div>
          {lastAnswer && (
            <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-text-secondary mb-1">
                <strong>{language === 'hi' ? 'सवाल:' : 'Question:'}</strong> {lastAnswer.question}
              </p>
              <p className="text-text-primary mt-2">{lastAnswer.answer}</p>
              <button
                type="button"
                onClick={playAnswer}
                className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-sm"
              >
                {answerPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {answerPlaying ? (language === 'hi' ? 'रोकें' : 'Stop') : (language === 'hi' ? 'जवाब सुनें' : 'Hear answer')}
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Choose language / भाषा चुनें" />
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setLanguage(lang.code)
                  stopSpeaking()
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  language === lang.code
                    ? 'bg-primary text-white'
                    : 'bg-muted text-text-secondary hover:bg-white/10'
                }`}
              >
                {lang.label} ({lang.labelEn})
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Common doubts – tap to hear / सामान्य सवाल – सुनने के लिए टैप करें" />
        <CardContent className="space-y-3">
          {DOUBTS.map((doubt) => (
            <div
              key={doubt.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-background/60 border border-border hover:border-primary/30 transition-colors"
            >
              <button
                type="button"
                onClick={() => handlePlay(doubt)}
                className="p-2 rounded-full bg-primary/20 text-primary hover:bg-primary/30 shrink-0"
                title={playingId === doubt.id ? 'Stop' : 'Play'}
              >
                {playingId === doubt.id ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-text-primary">{getDoubtTitle(doubt, language)}</h3>
                <p className="text-sm text-text-secondary mt-1 line-clamp-2">{getDoubtText(doubt, language)}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {businessId && (
        <Card>
          <CardHeader title="Recent updates (with voice) / हाल की सूचनाएं" />
          <CardContent>
            <WhatsAppNotifications businessId={businessId} maxItems={5} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
