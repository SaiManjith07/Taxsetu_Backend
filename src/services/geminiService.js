/**
 * Gemini AI service - OCR and parsing.
 * In production, call Firebase Cloud Functions that use Gemini (keeps API key server-side).
 * For dev/demo, can use client-side with VITE_GEMINI_API_KEY.
 */
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

// Prefer 2.5-flash first (free tier often has quota); then other models with generateContent
const PREFERRED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-pro-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-3.1-pro-preview',
  'gemini-pro',
]

const OCR_PROMPT = `You are an expert at reading Indian GST invoices. Extract the following from this invoice image and return ONLY valid JSON (no markdown, no code block): 
{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "supplier_name": "string",
  "supplier_gstin": "15 character GSTIN",
  "taxable_amount": number,
  "gst_rate": number (e.g. 18 for 18%),
  "gst_amount": number,
  "total_amount": number
}
Also include "confidence_score" (0-100) for each field in a nested object "confidence_scores" with keys matching the above. If a field is unreadable, use null and set its confidence to 0. Return only the JSON object.`

/** Parse "Please retry in 57.789s" from API error message. Returns seconds (number) or 60 default. */
function parseRetryAfterSeconds(message) {
  if (!message || typeof message !== 'string') return 60
  const match = message.match(/retry\s+in\s+([\d.]+)\s*s/i)
  return match ? Math.ceil(Number(match[1])) : 60
}

/** User-friendly rate limit error with retry time */
function createRateLimitError(apiMessage) {
  const seconds = parseRetryAfterSeconds(apiMessage)
  const err = new Error(`Rate limit reached. Please try again in ${seconds} seconds.`)
  err.retryAfterSeconds = seconds
  err.isRateLimit = true
  return err
}

async function callGeminiWithModelFallback(body, isImage = false) {
  let lastError = null
  let lastRateLimitMessage = ''
  for (const model of PREFERRED_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: body.contents,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: isImage ? 1024 : 512,
            responseMimeType: 'application/json',
            ...body.generationConfig,
          },
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        const msg = (err.error?.message || err.message || '').toLowerCase()
        const isRateLimitStatus = response.status === 429
        const isRateLimitMsg = /quota|rate limit|resource.exhausted|too many|exhausted|429/.test(msg)
        if (isRateLimitStatus || isRateLimitMsg) {
          const rawMsg = err.error?.message || err.message || `HTTP ${response.status}`
          lastRateLimitMessage = rawMsg
          lastError = createRateLimitError(rawMsg)
          continue
        }
        if (msg.includes('not found') || msg.includes('not supported') || response.status === 404) {
          lastError = new Error(msg)
          continue
        }
        throw new Error(msg || `Gemini API error: ${response.status}`)
      }
      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new Error('No response from Gemini')
      let trimmed = (typeof text === 'string' ? text : String(text)).trim()
      const looksLikeRateLimit = /retry|quota|rate limit|resource.exhausted|429|too many|exhausted|unavailable|capacity|try again/i.test(trimmed)
      if (!trimmed.startsWith('{')) {
        if (looksLikeRateLimit) {
          lastError = createRateLimitError(trimmed)
          lastRateLimitMessage = trimmed
          continue
        }
        throw new Error('AI returned an unexpected response. Please try again.')
      }
      // First attempt: direct JSON parse
      try {
        return JSON.parse(trimmed)
      } catch (parseErr) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('Gemini voice/JSON parse failed, raw text:', trimmed)
        }
        // Second attempt: strip common markdown fences / labels
        let cleaned = trimmed
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim()
        try {
          return JSON.parse(cleaned)
        } catch (e2) {
          // Third attempt: extract the first {...} block and parse that
          const match = cleaned.match(/\{[\s\S]*\}/)
          if (match) {
            try {
              return JSON.parse(match[0])
            } catch (e3) {
              // fall through to rate-limit / generic handling below
            }
          }
        }
        if (looksLikeRateLimit) {
          lastError = createRateLimitError(trimmed)
          lastRateLimitMessage = trimmed
          continue
        }
        throw new Error('AI returned invalid data. Please try again.')
      }
    } catch (e) {
      const isModelError = e.message?.includes('not found') || e.message?.includes('not supported')
      const isRateLimit = /quota|rate limit|429|too many|exhausted/i.test(e.message || '')
      if (isRateLimit) {
        lastError = e.isRateLimit ? e : createRateLimitError(e.message)
        lastRateLimitMessage = e.message
        continue
      }
      if (isModelError) {
        lastError = e
        continue
      }
      throw e
    }
  }
  if (lastError?.isRateLimit) throw lastError
  throw lastError || new Error('No Gemini model available. Try again later.')
}

export async function extractInvoiceFromImage(imageBase64) {
  if (!GEMINI_API_KEY) {
    await new Promise((r) => setTimeout(r, 1500))
    return {
      invoice_number: 'INV-2025-001',
      invoice_date: '2025-02-20',
      supplier_name: 'ABC Traders Pvt Ltd',
      supplier_gstin: '29ABCDE1234F1Z5',
      taxable_amount: 10000,
      gst_rate: 18,
      gst_amount: 1800,
      total_amount: 11800,
      confidence_scores: {
        invoice_number: 92,
        invoice_date: 88,
        supplier_name: 95,
        supplier_gstin: 90,
        taxable_amount: 98,
        gst_rate: 95,
        gst_amount: 96,
        total_amount: 97,
      },
    }
  }
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
  return callGeminiWithModelFallback(
    {
      contents: [
        {
          parts: [
            { text: OCR_PROMPT },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 1024 },
    },
    true
  )
}

const VOICE_PARSE_PROMPT = (transcript) =>
  `User spoke this in Hindi about a business transaction: "${transcript}". Parse and return ONLY valid JSON: {"transaction_type": "sale" or "purchase", "party_name": string, "party_gstin": string or null (15-char GSTIN if mentioned, e.g. 29ABCDE1234F1Z5), "amount": number, "gst_included": boolean, "date": "YYYY-MM-DD" or "today", "description": string}. If GSTIN is not mentioned set party_gstin to null. If any field is unclear, set to null and add "clarification_needed" array. No markdown, only JSON.`

export async function parseVoiceTranscript(transcript) {
  if (!GEMINI_API_KEY) {
    await new Promise((r) => setTimeout(r, 1000))
    return {
      transaction_type: 'purchase',
      party_name: 'Local Supplier',
      party_gstin: null,
      amount: 5000,
      gst_included: true,
      date: new Date().toISOString().slice(0, 10),
      description: 'From voice entry',
    }
  }
  try {
    return await callGeminiWithModelFallback({
      contents: [{ parts: [{ text: VOICE_PARSE_PROMPT(transcript) }] }],
      generationConfig: { maxOutputTokens: 512 },
    })
  } catch (e) {
    // If Gemini returned malformed JSON, fall back to a simple heuristic parser
    if (e?.message && e.message.includes('AI returned invalid data')) {
      const amountMatch = transcript.match(/(\d[\d,]*)/)
      const gstinMatch = transcript.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z0-9]/i)
      const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : null
      const gstMention =
        /gst|जीएसटी/i.test(transcript) || /गस्टिन/i.test(transcript) || /gstin/i.test(transcript)

      // Heuristic: extract party name like "मनजीत ट्रेडर्स"
      let partyName = null
      const nameMatch = transcript.match(/([^\s]+ ट्रेडर्स)/)
      if (nameMatch) {
        partyName = nameMatch[1].trim()
      }

      // Heuristic: try to reconstruct GSTIN when letters are spoken in Hindi (ए बी सी डी ए)
      let hindiGstin = null
      if (!gstinMatch) {
        const devanagariToLatin = {
          ए: 'A',
          बी: 'B',
          सी: 'C',
          डी: 'D',
          ई: 'E',
          एफ: 'F',
          जी: 'G',
          एच: 'H',
          आई: 'I',
          जे: 'J',
          के: 'K',
          एल: 'L',
          एम: 'M',
          एन: 'N',
          ओ: 'O',
          पी: 'P',
          क्यू: 'Q',
          आर: 'R',
          एस: 'S',
          टी: 'T',
          यू: 'U',
          वी: 'V',
          डब्ल्यू: 'W',
          एक्स: 'X',
          वाई: 'Y',
          जेड: 'Z',
        }
        const words = transcript.split(/\s+/)
        for (let i = 0; i < words.length; i += 1) {
          if (/^\d{2}$/.test(words[i])) {
            const prefix = words[i]
            const letters = []
            let j = i + 1
            while (j < words.length && devanagariToLatin[words[j]]) {
              letters.push(devanagariToLatin[words[j]])
              j += 1
            }
            if (letters.length >= 3 && j < words.length) {
              const tail = words[j].replace(/[^0-9A-Za-z]/g, '')
              if (tail.length >= 4) {
                hindiGstin = `${prefix}${letters.join('')}${tail}`.toUpperCase()
                break
              }
            }
          }
        }
      }

      return {
        transaction_type: 'purchase',
        party_name: partyName,
        party_gstin: (gstinMatch ? gstinMatch[0] : hindiGstin)?.toUpperCase() || null,
        amount: Number.isFinite(amount) ? amount : null,
        gst_included: gstMention,
        date: 'today',
        description: transcript.slice(0, 140),
        clarification_needed: ['AI parse failed; values extracted heuristically from voice text'],
      }
    }
    throw e
  }
}
