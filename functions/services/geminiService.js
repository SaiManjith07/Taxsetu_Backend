import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '')

const PREFERRED_MODELS = [
  'gemini-2.0-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
  'gemini-pro',
]

const OCR_PROMPT = `You are an expert at reading Indian GST invoices. Extract the following from this invoice image and return ONLY valid JSON (no markdown): 
{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "supplier_name": "string",
  "supplier_gstin": "15 character GSTIN",
  "taxable_amount": number,
  "gst_rate": number,
  "gst_amount": number,
  "total_amount": number,
  "confidence_scores": { "invoice_number": 0-100, ... }
}
If a field is unreadable use null and set its confidence to 0. Return only the JSON object.`

async function tryWithModels(generateContentFn) {
  let lastError = null
  for (const modelId of PREFERRED_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId })
      const result = await generateContentFn(model)
      const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new Error('No response from Gemini')
      return JSON.parse(text)
    } catch (e) {
      const isModelError = e.message?.includes('not found') || e.message?.includes('not supported') || e.message?.includes('404')
      if (isModelError) {
        lastError = e
        continue
      }
      throw e
    }
  }
  throw lastError || new Error('No Gemini model available.')
}

export const GeminiService = {
  async extractInvoiceFromImage(imageBase64) {
    if (!genAI.apiKey) throw new Error('GEMINI_API_KEY not set')
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    return tryWithModels((model) =>
      model.generateContent([
        { text: OCR_PROMPT },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Data,
          },
        },
      ])
    )
  },

  async parseVoiceTranscript(transcript) {
    if (!genAI.apiKey) throw new Error('GEMINI_API_KEY not set')
    const prompt = `User spoke this in Hindi about a business transaction: "${transcript}". Parse and return ONLY valid JSON: {"transaction_type": "sale" or "purchase", "party_name": string, "amount": number, "gst_included": boolean, "date": "YYYY-MM-DD", "description": string}. If unclear use null and add "clarification_needed" array. No markdown, only JSON.`
    return tryWithModels((model) => model.generateContent(prompt))
  },
}
