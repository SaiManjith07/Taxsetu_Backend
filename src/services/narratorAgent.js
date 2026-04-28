/**
 * Narrator Agent – Multilingual communication layer for TaxSetu.
 * Listens for events from Watcher, Calculator, Filer, Guardian; generates
 * simple explanations in Hindi/Tamil/Telugu and sends multi-channel notifications.
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '')
// Fallback list when List Models API is not used or fails. Prefer names that work on v1beta (current API).
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_FALLBACKS = ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro']

/** Get model; use v1beta so current Gemini models (2.5, 2.0) resolve. */
function getModel(name, requestOptions = {}) {
  const opts = { apiVersion: 'v1beta', ...requestOptions }
  return genAI.getGenerativeModel({ model: name }, opts)
}

/** Fetch list of models that support generateContent for this API key; returns array of model IDs (e.g. gemini-2.5-flash). */
let cachedModelIds = null
async function getAvailableModelIds(apiKey) {
  if (cachedModelIds && cachedModelIds.length > 0) return cachedModelIds
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=50`)
    if (!res.ok) return []
    const data = await res.json()
    const models = data.models || []
    const ids = models
      .filter(m => {
        const methods = m.supportedGenerationMethods || m.supported_generation_methods || []
        return methods.some(method => (method || '').toLowerCase().includes('generatecontent'))
      })
      .map(m => {
        const name = m.name || ''
        return name.replace(/^models\//i, '').trim()
      })
      .filter(Boolean)
    // Prefer flash / lighter models first for speed
    const order = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-pro']
    const sorted = [...new Set([...order.filter(id => ids.includes(id)), ...ids.filter(id => !order.includes(id))])]
    cachedModelIds = sorted.length ? sorted : []
    return cachedModelIds
  } catch {
    return []
  }
}

// Local FAQ: fallback only when Gemini API fails. Use specific phrases so we don't match every question (e.g. avoid lone "gst").
const LOCAL_GST_FAQ = [
  {
    // Definition-only: don't match "gst" alone so other questions get API or correct FAQ
    keywords: ['what is gst', 'explain gst', 'gst kya hai', 'gst meaning', 'what is goods and services tax', 'explain about gst', 'जीएसटी क्या है', 'gst बताओ', 'gst in simple'],
    hi: 'GST यानी Goods and Services Tax। यह भारत में लगने वाला एक अप्रत्यक्ष कर है जो सामान और सेवाओं पर लगता है। पुराने VAT, सेवा कर आदि को मिलाकर एक ही टैक्स बनाया गया है। व्यापारी खरीद पर दिए गए टैक्स को बिक्री के टैक्स से काट सकते हैं (ITC)।',
    en: 'GST stands for Goods and Services Tax. It is an indirect tax in India on goods and services. It replaced older taxes like VAT and service tax with one tax. Businesses can claim the tax paid on purchases against tax on sales (ITC).',
    ta: 'GST என்பது Goods and Services Tax. இந்தியாவில் சரக்கு மற்றும் சேவைகளில் விதிக்கப்படும் மறைமுக வரி. VAT, சேவை வரி போன்றவற்றை ஒன்றிணைத்து ஒரே வரி. வணிகர்கள் வாங்கியதில் செலுத்திய வரியை விற்பனை வரியிலிருந்து கழிக்கலாம் (ITC).',
    te: 'GST అంటే Goods and Services Tax. భారతదేశంలో సరకులు మరియు సేవలపై విధించే పరోక్ష పన్ను. VAT, సేవా పన్ను మొదలైనవాటిని ఒకే పన్నుగా మార్చారు. వ్యాపారులు కొనుగోలుపై చెల్లించిన పన్నును అమ్మకం పన్ను నుండి తగ్గించుకోవచ్చు (ITC).',
  },
  {
    keywords: ['itc', 'input tax credit', 'input tax', 'खरीद पर टैक्स', 'credit claim', 'tax credit'],
    hi: 'ITC यानी Input Tax Credit। जब आप किसी से सामान या सेवा खरीदते हैं और GST चुकाते हैं, तो उस टैक्स को आप अपनी बिक्री पर देय GST में काट सकते हैं। इससे दोहरा टैक्स नहीं लगता। नियमों के अनुसार ही ITC लिया जा सकता है।',
    en: 'ITC means Input Tax Credit. When you buy goods or services and pay GST, you can set off that tax against the GST you owe on your sales. This avoids double taxation. ITC can be claimed only as per the rules.',
    ta: 'ITC என்பது Input Tax Credit. நீங்கள் சரக்கு அல்லது சேவை வாங்கி GST செலுத்தும்போது, அந்த வரியை உங்கள் விற்பனை மீதான GST இலிருந்து கழிக்கலாம். இரட்டை வரி ஏற்படாது. விதிகளின்படி மட்டுமே ITC கோரலாம்.',
    te: 'ITC అంటే Input Tax Credit. మీరు సరకులు లేదా సేవలు కొనుగోలు చేసి GST చెల్లించినప్పుడు, ఆ పన్నును మీ అమ్మకాలపై బాధ్యత ఉన్న GST నుండి తగ్గించుకోవచ్చు. ద్వంద్వ పన్ను ఉండదు. నిబంధనల ప్రకారమే ITC క్లెయిమ్ చేయవచ్చు.',
  },
  {
    keywords: ['gstr-3b', 'gstr 3b', '3b', '3b return', '3b filing', '3b due', '3b date', 'मासिक रिटर्न'],
    hi: 'GSTR-3B एक मासिक सारांश रिटर्न है। इसमें आप बिक्री का GST, खरीद पर ITC और देय टैक्स भरते हैं। आमतौर पर अगले महीने की 20 तारीख तक जमा करना होता है। ऑनलाइन GST पोर्टल पर लॉग इन करके जमा कर सकते हैं।',
    en: 'GSTR-3B is a monthly summary return. You report outward GST, ITC on purchases, and tax payable. It is usually due by the 20th of the next month. File it on the GST portal after logging in.',
    ta: 'GSTR-3B மாதாந்திர சுருக்க தாக்கல். விற்பனை GST, வாங்கியதில் ITC, செலுத்த வேண்டிய வரியை நீங்கள் பதிவு செய்கிறீர்கள். அடுத்த மாதம் 20ம் தேதிக்குள் தாக்கல் செய்ய வேண்டும். GST போர்டலில் லாகின் செய்து தாக்கல் செய்யலாம்.',
    te: 'GSTR-3B నెలవారీ సారాంశ రిటర్న్. అమ్మకాలపై GST, కొనుగోలుపై ITC మరియు చెల్లించాల్సిన పన్నును నమోదు చేస్తారు. సాధారణంగా తర్వాత నెల 20న వరకు దాఖలు చేయాలి. GST పోర్టల్లో లాగిన్ అయిన తర్వాత దాఖలు చేయండి.',
  },
  {
    keywords: ['due date', 'last date', 'filing date', 'कब तक', 'किस तारीख', 'deadline'],
    hi: 'GSTR-3B आमतौर पर अगले महीने की 20 तारीख तक जमा करना होता है। GSTR-1 की अंतिम तारीख अगले महीने की 11वीं हो सकती है। अपने टर्नओवर और श्रेणी के हिसाब से पोर्टल पर दिए गए तारीखें देखें।',
    en: 'GSTR-3B is usually due by the 20th of the next month. GSTR-1 may be due by the 11th of the next month. Check the portal for dates based on your turnover and category.',
    ta: 'GSTR-3B அடுத்த மாதம் 20ம் தேதிக்குள் தாக்கல் செய்ய வேண்டும். GSTR-1 அடுத்த மாதம் 11ம் தேதிக்குள் இருக்கலாம். உங்கள் வருவாய் மற்றும் வகைக்கு ஏற்ப போர்டலில் தேதிகளைப் பாருங்கள்.',
    te: 'GSTR-3B సాధారణంగా తర్వాత నెల 20న వరకు దాఖలు చేయాలి. GSTR-1 తర్వాత నెల 11న వరకు ఉండవచ్చు. మీ టర్నోవర్ మరియు వర్గం ప్రకారం పోర్టల్లో తేదీలను తనిఖీ చేయండి.',
  },
  {
    keywords: ['supplier', 'supplier filing', 'vendor', 'देने वाला', 'खरीददार'],
    hi: 'अगर आपके सप्लायर ने अपना रिटर्न नहीं भरा तो आपको उस खरीद पर ITC नहीं मिल सकता। इसलिए ऐसे सप्लायर चुनें जो समय पर GSTR-1 और GSTR-3B भरते हों। टैक्स मित्र में गार्डियन से सप्लायर फाइलिंग चेक कर सकते हैं।',
    en: 'If your supplier has not filed their return, you may not get ITC on that purchase. So choose suppliers who file GSTR-1 and GSTR-3B on time. You can check supplier filing in Guardian in TaxMitra.',
    ta: 'உங்கள் சப்ளையர் தாக்கல் செய்யாவிட்டால், அந்த வாங்கியதில் ITC கிடைக்காது. எனவே GSTR-1, GSTR-3B சரியான நேரத்தில் தாக்கல் செய்யும் சப்ளையர்களை தேர்ந்தெடுங்கள். டாக்ஸ் மித்ராவில் கார்டியனில் சப்ளையர் தாக்கலை சரிபார்க்கலாம்.',
    te: 'మీ సప్లయర్ రిటర్న్ దాఖలు చేయకపోతే, ఆ కొనుగోలుపై ITC రాదు. కాబట్టి GSTR-1 మరియు GSTR-3B సకాలంలో దాఖలు చేసే సప్లయర్లను ఎంచుకోండి. టాక్స్ మిత్రాలో గార్డియన్లో సప్లయర్ ఫైలింగ్ తనిఖీ చేయవచ్చు.',
  },
  {
    keywords: ['notice', 'demand', 'नोटिस', 'डिमांड', 'order', 'arrest'],
    hi: 'GST नोटिस या डिमांड आमतौर पर टैक्स विभाग की तरफ से आता है अगर रिटर्न नहीं भरा, टैक्स कम दिखाया या मिलान नहीं होता। नोटिस में दी गई तारीख तक जवाब दें या टैक्स/जुर्माना जमा करें। गार्डियन में पोर्टल नोटिस चेक कर सकते हैं।',
    en: 'GST notice or demand usually comes from the tax department if returns are not filed, tax is under-reported, or there is a mismatch. Reply by the date in the notice or pay tax/penalty. You can check portal notices in Guardian.',
    ta: 'ரிடர்ன் தாக்கல் செய்யவில்லை, வரி குறைவாக காட்டப்பட்டது அல்லது பொருந்தவில்லை என்றால் GST நோட்டீஸ் அல்லது டிமாண்ட் வரும். நோட்டீஸில் உள்ள தேதிக்குள் பதிலளிக்கவும் அல்லது வரி/அபராதம் செலுத்தவும். கார்டியனில் போர்டல் நோட்டீஸை சரிபார்க்கலாம்.',
    te: 'రిటర్న్ దాఖలు చేయకపోతే, పన్ను తక్కువ చూపిస్తే లేదా మ్యాచ్ కాకపోతే GST నోటీసు లేదా డిమాండ్ వస్తుంది. నోటీసులో ఇచ్చిన తేదీ వరకు జవాబు ఇవ్వండి లేదా పన్ను/జరిమానా చెల్లించండి. గార్డియన్లో పోర్టల్ నోటీస్లను తనిఖీ చేయవచ్చు.',
  },
  {
    keywords: ['rate', 'gst rate', 'percent', 'प्रतिशत', 'कितना percent', 'tax rate'],
    hi: 'GST में अलग-अलग सामान और सेवाओं पर अलग स्लैब हैं: 0%, 5%, 12%, 18%, 28%। ज़्यादातर सामान 18% या 12% पर आते हैं। कुछ ज़रूरी चीज़ें 5% या 0% पर हैं। पोर्टल या CBIC की सूची देखें।',
    en: 'GST has different slabs for different goods and services: 0%, 5%, 12%, 18%, 28%. Most items are at 18% or 12%. Some essentials are at 5% or 0%. Check the portal or CBIC list.',
    ta: 'GST வெவ்வேறு சரக்கு மற்றும் சேவைகளுக்கு வெவ்வேறு அடுக்குகள்: 0%, 5%, 12%, 18%, 28%. பெரும்பாலான பொருட்கள் 18% அல்லது 12%. சில அத்தியாவசியங்கள் 5% அல்லது 0%. போர்டல் அல்லது CBIC பட்டியலைப் பாருங்கள்.',
    te: 'GSTకు వేర్వేరు సరకులు మరియు సేవలకు వేర్వేరు స్లాబ్లు ఉన్నాయి: 0%, 5%, 12%, 18%, 28%. చాలా అంశాలు 18% లేదా 12%. కొన్ని అవసరాలకు 5% లేదా 0%. పోర్టల్ లేదా CBIC జాబితా చూడండి.',
  },
  {
    keywords: ['hsn', 'sac', 'code', 'हsn', 'कोड'],
    hi: 'HSN कोड सामान की पहचान के लिए और SAC कोड सेवाओं के लिए इस्तेमाल होते हैं। बिल और रिटर्न में सही HSN/SAC लिखना ज़रूरी है। 4, 6 या 8 अंकों का कोड इनवॉइस पर दिखता है।',
    en: 'HSN code is used for goods and SAC code for services. You must mention the correct HSN/SAC on invoices and returns. A 4-, 6-, or 8-digit code appears on the invoice.',
    ta: 'HSN குறியீடு சரக்குகளுக்கும் SAC குறியீடு சேவைகளுக்கும் பயன்படுத்தப்படுகிறது. இன்வாய்ஸ் மற்றும் ரிடர்ன்களில் சரியான HSN/SAC குறிப்பிட வேண்டும். 4, 6 அல்லது 8 இலக்க குறியீடு இன்வாய்ஸில் இருக்கும்.',
    te: 'HSN కోడ్ సరకులకు, SAC కోడ్ సేవలకు ఉపయోగిస్తారు. ఇన్వాయిస్ మరియు రిటర్న్లలో సరైన HSN/SAC ఉండాలి. 4, 6 లేదా 8 అంకెల కోడ్ ఇన్వాయిస్లో ఉంటుంది.',
  },
  {
    keywords: ['file', 'filing', 'how to file', 'return file', 'जमा करें', 'कैसे भरें', 'submit'],
    hi: 'GST रिटर्न GST पोर्टल (gst.gov.in) पर लॉग इन करके जमा करें। GSTR-3B मासिक और GSTR-1 बिल के हिसाब से भरते हैं। सही तारीख से पहले जमा करना ज़रूरी है वरना लेट फी लग सकती है।',
    en: 'File GST returns by logging in at the GST portal (gst.gov.in). GSTR-3B is monthly; GSTR-1 is based on invoices. File before the due date to avoid late fees.',
    ta: 'GST போர்டலில் (gst.gov.in) லாகின் செய்து ரிடர்ன்கள் தாக்கல் செய்யுங்கள். GSTR-3B மாதாந்திரம்; GSTR-1 இன்வாய்ஸ் அடிப்படையில். தாமத கட்டணம் தவிர்க்க சரியான தேதிக்குள் தாக்கல் செய்யுங்கள்.',
    te: 'GST పోర్టల్ (gst.gov.in)లో లాగిన్ అయి రిటర్న్లు దాఖలు చేయండి. GSTR-3B నెలవారీ; GSTR-1 ఇన్వాయిస్ల ప్రకారం. లేట్ ఫీ తప్పించడానికి నిర్ణయించిన తేదీకి ముందు దాఖలు చేయండి.',
  },
  {
    keywords: ['register', 'registration', 'gst number', 'gstin', 'पंजीकरण', 'नंबर कैसे लें'],
    hi: 'GST रजिस्ट्रेशन gst.gov.in पर ऑनलाइन कर सकते हैं। टर्नओवर 20 लाख (विशेष राज्यों में 10 लाख) से ऊपर हो तो रजिस्ट्रेशन ज़रूरी है। पैन, बिजनेस का पता और बैंक विवरण चाहिए।',
    en: 'You can register for GST online at gst.gov.in. Registration is required if turnover is above Rs 20 lakh (Rs 10 lakh in some states). You need PAN, business address, and bank details.',
    ta: 'gst.gov.in இல் ஆன்லைனில் GST பதிவு செய்யலாம். வருவாய் 20 லட்சம் (சில மாநிலங்களில் 10 லட்சம்) மேல் இருந்தால் பதிவு தேவை. PAN, வணிக முகவரி, வங்கி விவரங்கள் தேவை.',
    te: 'gst.gov.inలో ఆన్లైన్‌లో GST రిజిస్ట్రేషన్ చేయవచ్చు. టర్నోవర్ 20 లక్షలు (కొన్ని రాష్ట్రాలలో 10 లక్షలు) మించి ఉంటే రిజిస్ట్రేషన్ అవసరం. PAN, వ్యాపార చిరునామా మరియు బ్యాంక్ వివరాలు కావాలి.',
  },
]

/** Match user question to local FAQ; returns answer string in requested language or null. Used only as fallback when API fails. */
function getLocalFAQAnswer(question, language) {
  const q = question.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!q || q.length < 2) return null
  for (const entry of LOCAL_GST_FAQ) {
    const match = entry.keywords.some(kw => q.includes(kw.toLowerCase()))
    if (match) return entry[language] || entry.en
  }
  return null
}

// ============================================
// 1. MAIN NOTIFICATION HANDLER
// ============================================

/**
 * Main entry point for all notifications.
 *
 * @param {Object} params
 * @param {string} params.event - Event type (invoice_processed, filing_success, etc.)
 * @param {string} params.user_id - Business ID (stored as business_id in Firestore)
 * @param {Object} params.data - Event-specific data
 * @param {string} [params.priority] - normal | high | urgent
 * @param {Array<string>} [params.channels] - ['app', 'whatsapp', 'email']
 */
export async function notify(params) {
  try {
    const businessId = params.user_id
    if (!businessId) return { success: false, error: 'user_id required' }

    const userProfile = await getUserProfile(businessId)

    let explanation
    const hasGeminiKey = !!import.meta.env.VITE_GEMINI_API_KEY?.trim()
    if (!hasGeminiKey) {
      explanation = fallbackExplanation(params.event, params.data)
    } else {
      try {
        explanation = await generateExplanation({
          event: params.event,
          data: params.data || {},
          language: userProfile.preferred_language,
          knowledge_level: userProfile.gst_knowledge_level,
          learning_style: userProfile.learning_style,
        })
      } catch (e) {
        console.warn('Narrator: using fallback text (Gemini unavailable).', e?.message || e)
        explanation = fallbackExplanation(params.event, params.data)
      }
    }

    const tone = determineTone(params.event, params.priority || 'normal')

    const notification = {
      business_id: businessId,
      type: 'narrator',
      event: params.event,
      priority: params.priority || 'normal',
      tone,
      created_at: Timestamp.now(),
      read: false,

      title_hindi: explanation.title_hindi || explanation.title_english || '',
      title_english: explanation.title_english || '',
      hindi: explanation.hindi || '',
      english: explanation.english || '',
      regional: explanation.regional || null,
      summary: explanation.summary || '',
      actions: explanation.actions || [],
      key_numbers: explanation.key_numbers || null,

      channels_requested: params.channels || ['app'],
      channels_delivered: [],

      audio_url: null,
      audio_duration: null,
      tts_text: explanation.hindi || explanation.english,
    }

    if (params.channels?.includes('whatsapp') || params.channels?.includes('app')) {
      try {
        const voiceResult = generateVoiceInBrowser({
          text: notification.tts_text,
          language: userProfile.preferred_language,
          tone,
          gender: userProfile.voice_preference || 'female',
        })
        notification.audio_duration = voiceResult.duration
        notification.tts_lang = voiceResult.lang
      } catch (_) {
        notification.audio_duration = estimateDuration(notification.tts_text || '')
      }
    }

    const notificationRef = await addDoc(collection(db, 'notifications'), notification)

    for (const channel of params.channels || ['app']) {
      try {
        await sendThroughChannel(channel, notification, userProfile)
        notification.channels_delivered.push(channel)
      } catch (err) {
        console.warn(`Narrator send ${channel} failed:`, err?.message || err)
      }
    }

    if (notification.channels_delivered.length > 0) {
      await updateDoc(notificationRef, { channels_delivered: notification.channels_delivered })
    }

    try {
      await updateLearningProfile(businessId, params.event, explanation)
    } catch (_) {}

    return {
      success: true,
      notification_id: notificationRef.id,
      channels_delivered: notification.channels_delivered,
    }
  } catch (error) {
    console.error('Narrator.notify error:', error)
    throw error
  }
}

// ============================================
// 2. GENERATE EXPLANATION WITH GEMINI
// ============================================

async function generateExplanation(params) {
  const eventPrompts = {
    invoice_processed: `
User uploaded an invoice. Explain what happened and what it means in simple language.

INVOICE DATA:
${JSON.stringify(params.data?.invoice || params.data, null, 2)}

ITC RESULT (if any):
${JSON.stringify(params.data?.itc || {}, null, 2)}

USER KNOWLEDGE LEVEL: ${params.knowledge_level || 'beginner'}
(beginner = explain everything simply, intermediate = some terms okay, expert = technical is fine)

Create explanation in ${params.language === 'hi' ? 'Hindi' : params.language === 'ta' ? 'Tamil' : params.language === 'te' ? 'Telugu' : 'Hindi'}.

Return ONLY valid JSON in this exact shape:
{
  "title_hindi": "short title in Hindi",
  "title_english": "short title in English",
  "hindi": "full explanation in conversational Hindi",
  "english": "full explanation in English",
  "summary": "one-line summary",
  "key_numbers": { "amount": number, "itc": number, "month_total": number },
  "actions": [ { "label_hindi": "string", "label_english": "string", "action": "string" } ],
  "teaching_moment": "optional GST concept if relevant"
}
`,

    filing_success: `
User successfully filed GST return. Create a short celebratory message!

FILING DATA:
${JSON.stringify(params.data || {}, null, 2)}

Create CELEBRATORY message in ${params.language === 'hi' ? 'Hindi' : 'English'}.
Use emojis (🎉 ✅). Mention on-time filing, next deadline if any.

Return ONLY valid JSON:
{
  "title_hindi": "string",
  "title_english": "string",
  "hindi": "string",
  "english": "string",
  "summary": "string",
  "actions": [ { "label_hindi": "string", "label_english": "string", "action": "string" } ]
}
`,

    deadline_reminder: `
Deadline approaching. Create a friendly reminder.

DEADLINE DATA:
${JSON.stringify(params.data || {}, null, 2)}

Tone: ${params.data?.days_left <= 2 ? 'Urgent but calm' : 'Friendly reminder'}

Return ONLY valid JSON with title_hindi, title_english, hindi, english, summary, actions (include CTA to file).
`,

    notice_received: `
GST notice received. Explain clearly without causing panic.

NOTICE DATA:
${JSON.stringify(params.data?.notice || params.data || {}, null, 2)}

Create CLEAR, CALM explanation in ${params.language === 'hi' ? 'Hindi' : 'English'}.
Include: what the notice is about, what to do (steps), deadline, reassurance.

Return ONLY valid JSON with title_hindi, title_english, hindi, english, summary, actions.
`,

    supplier_risk_detected: `
Supplier has not filed return; user's ITC is at risk.

DATA:
${JSON.stringify(params.data?.suppliers || params.data || {}, null, 2)}

Create a short, clear nudge in Hindi and English. Tone: concerned but actionable.

Return ONLY valid JSON with title_hindi, title_english, hindi, english, summary, actions.
`,

    month_end_summary: `
Month-end summary for the business. Summarise key numbers and next steps.

DATA:
${JSON.stringify(params.data || {}, null, 2)}

Return ONLY valid JSON with title_hindi, title_english, hindi, english, summary, key_numbers, actions.
`,
  }

  const prompt = eventPrompts[params.event] || `
Explain this event in simple language for an Indian MSME. Event: ${params.event}
Data: ${JSON.stringify(params.data || {}, null, 2)}
Return ONLY valid JSON: { "title_hindi": "", "title_english": "", "hindi": "", "english": "", "summary": "" }
`
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey?.trim()) {
    throw new Error('No Gemini API key')
  }

  const modelsToTry = [GEMINI_MODEL, ...GEMINI_FALLBACKS.filter(m => m !== GEMINI_MODEL)]
  let lastError
  for (const modelId of modelsToTry) {
    try {
      const model = getModel(modelId)
      const result = await model.generateContent(prompt)
      const text = result.response?.text?.() || ''
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      return JSON.parse(cleaned)
    } catch (err) {
      lastError = err
      const msg = (err?.message || String(err)).toLowerCase()
      const is404 = msg.includes('404') || msg.includes('not found') || msg.includes('is not found for api')
      if (!is404) break
    }
  }
  throw lastError
}

function fallbackExplanation(event, data) {
  const defaults = {
    invoice_processed: {
      title_hindi: 'चालान प्रोसेस हुआ',
      title_english: 'Invoice processed',
      hindi: 'आपका चालान सेव कर हो गया। ITC की गणना अपडेट कर दी गई है।',
      english: 'Your invoice was saved and ITC has been updated.',
      summary: 'Invoice processed and ITC updated.',
      actions: [],
    },
    filing_success: {
      title_hindi: 'रिटर्न फाइल हो गया 🎉',
      title_english: 'Return filed successfully 🎉',
      hindi: 'बधाई हो! आपका GSTR-3B इस पीरियड के लिए सफलतापूर्वक फाइल हो गया।',
      english: 'Congratulations! Your GSTR-3B for this period has been filed successfully.',
      summary: 'Return filed successfully.',
      actions: [],
    },
    deadline_reminder: {
      title_hindi: 'डेडलाइन याद दिलावट',
      title_english: 'Deadline reminder',
      hindi: 'रिटर्न फाइल करने की तारीख नज़दीक है। समय पर फाइल करें।',
      english: 'Filing deadline is approaching. Please file on time.',
      summary: 'Deadline reminder.',
      actions: [],
    },
    notice_received: {
      title_hindi: 'GST नोटिस प्राप्त',
      title_english: 'GST notice received',
      hindi: 'आपको एक GST नोटिस मिली है। Guardian में विवरण और एक्शन प्लान देखें।',
      english: 'You have received a GST notice. Check Guardian for details and action plan.',
      summary: 'GST notice received.',
      actions: [{ label_hindi: 'Guardian देखें', label_english: 'View Guardian', action: '/guardian' }],
    },
    supplier_risk_detected: {
      title_hindi: 'सप्लायर रिस्क',
      title_english: 'Supplier risk',
      hindi: 'एक सप्लायर ने रिटर्न नहीं दाखिल किया; आपका ITC अटक सकता है। पेंडिंग इनवॉइस तब तक पे न करें जब तक वे फाइल न करें।',
      english: "A supplier hasn't filed; your tax credit may be blocked. Don't pay their pending invoice until they file.",
      summary: 'Supplier filing risk.',
      actions: [],
    },
    month_end_summary: {
      title_hindi: 'महीने का सारांश',
      title_english: 'Month-end summary',
      hindi: 'इस महीने के आउटवर्ड और ITC का सारांश तैयार है। रिटर्न फाइल करने के लिए Calculator या Filer खोलें।',
      english: 'Summary for this month is ready. Open Calculator or Filer to file your return.',
      summary: 'Month-end summary ready.',
      actions: [],
    },
  }
  return defaults[event] || {
    title_hindi: 'सूचना',
    title_english: 'Notification',
    hindi: 'नई गतिविधि हुई है।',
    english: 'There is a new update.',
    summary: 'Update',
    actions: [],
  }
}

// ============================================
// 3. VOICE (BROWSER TTS FOR MVP)
// ============================================

function generateVoiceInBrowser(params) {
  const langMap = { hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', en: 'en-IN' }
  const duration = estimateDuration(params.text || '')
  return {
    url: null,
    duration,
    lang: langMap[params.language] || 'hi-IN',
    text: params.text,
  }
}

function estimateDuration(text) {
  if (!text) return 0
  const words = text.trim().split(/\s+/).length
  const wpm = 150
  return Math.max(1, Math.ceil((words / wpm) * 60))
}

// ============================================
// 4. SEND THROUGH CHANNELS
// ============================================

async function sendThroughChannel(channel, notification, userProfile) {
  switch (channel) {
    case 'app':
      return sendAppNotification(notification, userProfile)
    case 'whatsapp':
      return sendWhatsAppNotification(notification, userProfile)
    case 'email':
      return sendEmailNotification(notification, userProfile)
    default:
      return Promise.resolve()
  }
}

async function sendAppNotification() {
  // Single notification doc already saved in notify(); app UI reads from notifications collection.
  return { success: true }
}

async function sendWhatsAppNotification() {
  // MVP: WhatsApp-style UI in app reads from same notifications collection.
  return { success: true }
}

async function sendEmailNotification(notification, userProfile) {
  if (!userProfile?.email) return { success: false }
  // TODO: call Cloud Function or SendGrid when email is implemented
  return { success: false }
}

// ============================================
// 5. TONE & HELPERS
// ============================================

function determineTone(event, priority) {
  const map = {
    invoice_processed: 'friendly',
    filing_success: 'celebratory',
    compliance_improved: 'encouraging',
    deadline_reminder: priority === 'urgent' ? 'urgent' : 'friendly',
    supplier_risk_detected: 'concerned',
    supplier_risk: 'concerned',
    itc_mismatch: 'informative',
    notice_received: 'calm_urgent',
    penalty_risk: 'serious',
    month_end_summary: 'helpful',
  }
  return map[event] || 'friendly'
}

async function getUserProfile(businessId) {
  try {
    const ref = doc(db, 'businesses', businessId)
    const snap = await getDoc(ref)
    const d = snap.data() || {}
    return {
      preferred_language: d.preferred_language || 'hi',
      gst_knowledge_level: d.gst_knowledge_level || 'beginner',
      learning_style: d.learning_style || 'examples',
      voice_preference: d.voice_preference || 'female',
      notification_preferences: d.notification_preferences || {},
      phone: d.phone,
      email: d.email,
    }
  } catch {
    return {
      preferred_language: 'hi',
      gst_knowledge_level: 'beginner',
      learning_style: 'examples',
      voice_preference: 'female',
      notification_preferences: {},
      phone: null,
      email: null,
    }
  }
}

async function updateLearningProfile(businessId, event, explanation) {
  try {
    const ref = doc(db, 'businesses', businessId)
    const snap = await getDoc(ref)
    const data = snap.data() || {}
    const learning = data.learning_profile || {
      concepts_taught: [],
      concepts_mastered: [],
      total_notifications: 0,
      engagement_score: 0,
    }
    const concepts = extractConcepts(explanation)
    concepts.forEach((c) => {
      if (!learning.concepts_taught.includes(c)) learning.concepts_taught.push(c)
    })
    learning.total_notifications = (learning.total_notifications || 0) + 1
    await updateDoc(ref, {
      learning_profile: learning,
      last_notification_at: new Date().toISOString(),
    })
  } catch (_) {}
}

function extractConcepts(explanation) {
  const keywords = [
    'ITC', 'CGST', 'SGST', 'IGST', 'GSTIN', 'ARN',
    'GSTR-1', 'GSTR-3B', 'reverse_charge', 'composition',
    'invoice', 'credit', 'output_tax', 'input_tax',
  ]
  const text = JSON.stringify(explanation || {}).toLowerCase()
  return keywords.filter((k) => text.includes(k.toLowerCase()))
}

// ============================================
// EXPORTS & CONVENIENCE
// ============================================

export default {
  notify,
  sendThroughChannel,
}

export async function sendAlert(userId, data) {
  return notify({
    event: data.event || 'notice_received',
    user_id: userId,
    data,
    priority: 'urgent',
    channels: ['app', 'whatsapp'],
  })
}

export async function celebrate(userId, data) {
  return notify({
    event: 'filing_success',
    user_id: userId,
    data,
    priority: 'high',
    channels: ['app', 'whatsapp'],
  })
}

export async function remind(userId, data) {
  return notify({
    event: 'deadline_reminder',
    user_id: userId,
    data,
    priority: data?.days_left <= 2 ? 'urgent' : 'normal',
    channels: ['app', 'whatsapp'],
  })
}

/**
 * Answer a GST-related question in the user's language (for Narrator page).
 * @param {string} question - User's question in any language
 * @param {string} language - 'hi' | 'en' | 'ta' | 'te'
 * @returns {Promise<{ answer: string }>}
 */
export async function answerGSTQuestion(question, language = 'hi') {
  const langNames = { hi: 'Hindi', en: 'English', ta: 'Tamil', te: 'Telugu' }
  const lang = langNames[language] || 'Hindi'
  if (!question?.trim()) {
    return {
      answer: language === 'hi'
        ? 'कृपया अपना सवाल लिखें।'
        : 'Please type your question.',
    }
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim()

  // 1) If API key exists: discover models that work with this key, then try each until one succeeds
  if (apiKey) {
    const prompt = `You are a friendly GST expert for Indian MSMEs. Answer the following question in ${lang} only. Keep the answer simple, 2-5 sentences. If the question is not about GST/tax/compliance, say you can only help with GST-related questions.

Question: ${question.trim()}

Answer in ${lang} (plain text, no bullet points unless needed):`

    const modelIds = await getAvailableModelIds(apiKey)
    const toTry = modelIds.length > 0
      ? modelIds
      : [GEMINI_MODEL, ...GEMINI_FALLBACKS.filter(m => m !== GEMINI_MODEL)]
    let lastError
    for (const modelId of toTry) {
      try {
        const model = getModel(modelId)
        const result = await model.generateContent(prompt)
        const text = (result.response?.text?.() || '').trim()
        if (text) return { answer: text }
      } catch (err) {
        lastError = err
      }
    }
    console.warn('answerGSTQuestion failed:', lastError?.message)
  }

  // 2) No API key or all models failed: use local FAQ so common questions still get an answer
  const localAnswer = getLocalFAQAnswer(question, language)
  if (localAnswer) return { answer: localAnswer }

  if (!apiKey) {
    return {
      answer: language === 'hi'
        ? 'विस्तृत जवाब के लिए .env में VITE_GEMINI_API_KEY सेट करें। नीचे कॉमन डाउट्स देख सकते हैं।'
        : 'Set VITE_GEMINI_API_KEY in .env for full answers. You can use the common doubts below.',
    }
  }

  const generic = language === 'hi'
    ? 'इस सवाल का जवाब अभी नहीं मिल सका। नीचे कॉमन डाउट्स देखें या बाद में दोबारा कोशिश करें।'
    : 'Could not get an answer for this question right now. Check the common doubts below or try again later.'
  return { answer: generic }
}
