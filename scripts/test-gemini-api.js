/**
 * Test Gemini API key and voice-parsing request.
 * Run: node scripts/test-gemini-api.js
 * Or:  VITE_GEMINI_API_KEY=your_key node scripts/test-gemini-api.js
 *
 * Loads VITE_GEMINI_API_KEY from .env if present (same as Vite).
 */
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function loadEnv() {
  const path = join(root, '.env')
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf8')
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*VITE_GEMINI_API_KEY\s*=\s*(.+?)\s*$/)
    if (m) {
      const v = m[1].replace(/^["']|["']$/g, '').trim()
      if (v && !process.env.VITE_GEMINI_API_KEY) process.env.VITE_GEMINI_API_KEY = v
      break
    }
  }
}

loadEnv()

const API_KEY = process.env.VITE_GEMINI_API_KEY

if (!API_KEY) {
  console.error('Missing VITE_GEMINI_API_KEY. Set it in .env or run:')
  console.error('  VITE_GEMINI_API_KEY=your_key node scripts/test-gemini-api.js')
  process.exit(1)
}

// Mask key in logs
const keyPreview = API_KEY.slice(0, 8) + '...' + API_KEY.slice(-4)
console.log('Using API key:', keyPreview)

const VOICE_PARSE_PROMPT = (transcript) =>
  `User spoke this in Hindi about a business transaction: "${transcript}". Parse and return ONLY valid JSON: {"transaction_type": "sale" or "purchase", "party_name": string, "amount": number, "gst_included": boolean, "date": "YYYY-MM-DD" or "today", "description": string}. If any field is unclear, set to null and add "clarification_needed" array listing unclear fields. No markdown, only JSON.`

async function callGemini(model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: body.contents,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        ...body.generationConfig,
      },
    }),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { _raw: text.slice(0, 200) }
  }
  return { ok: res.ok, status: res.status, data }
}

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  const models = data.models || []
  return models
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace('models/', ''))
}

async function run() {
  console.log('\n--- List available models (with generateContent) ---')
  let modelIds = []
  try {
    modelIds = await listModels()
    console.log('Models:', modelIds.join(', ') || '(none)')
  } catch (e) {
    console.log('Could not list models:', e.message)
  }

  const toTry = modelIds.length
    ? modelIds
    : [
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash',
        'gemini-pro',
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro',
      ]

  console.log('\n--- Find first model with quota (minimal generateContent) ---')
  let workingModel = null
  for (const model of toTry.slice(0, 12)) {
    const r = await callGemini(model, {
      contents: [{ parts: [{ text: 'Reply with only this JSON: {"ok": true}' }] }],
    })
    if (r.ok) {
      console.log('  ', model, '-> 200 OK (has quota)')
      workingModel = model
      break
    }
    const msg = r.data?.error?.message || ''
    const short = msg.includes('limit: 0') ? 'limit 0' : r.status === 404 ? '404' : ` ${r.status}`
    console.log('  ', model, '->', short)
  }
  if (workingModel) {
    console.log('\n>>> Use this model first:', workingModel)
  }

  console.log('\n--- Test 1: Minimal API check (gemini-2.0-flash) ---')
  const r1 = await callGemini('gemini-2.0-flash', {
    contents: [{ parts: [{ text: 'Reply with only this JSON, nothing else: {"ok": true}' }] }],
  })
  if (r1.ok) {
    const out = r1.data?.candidates?.[0]?.content?.parts?.[0]?.text
    console.log('Status:', r1.status, 'OK')
    console.log('Response snippet:', out ? out.slice(0, 120) : r1.data)
    if (out) {
      try {
        const parsed = JSON.parse(out.trim())
        console.log('Parsed JSON:', parsed)
      } catch (e) {
        console.log('(Could not parse as JSON:', e.message, ')')
      }
    }
  } else {
    console.log('Status:', r1.status, r1.status === 429 ? '(Too Many Requests – rate limit)' : '')
    console.log('Error:', r1.data?.error?.message || r1.data?._raw || JSON.stringify(r1.data))
    if (r1.status === 429) {
      console.log('\nRate limit tips: wait 1–2 minutes, or try a different model below.')
    }
  }

  const sampleTranscript = 'मैंने आज ABC ट्रेडर्स से पचास हजार रुपए का माल खरीदा। GST इनक्लूडेड है।'
  const voiceModel = workingModel || 'gemini-2.5-flash'
  console.log('\n--- Test 2: Voice parsing (same as app, model:', voiceModel, ') ---')
  const r2 = await callGemini(voiceModel, {
    contents: [{ parts: [{ text: VOICE_PARSE_PROMPT(sampleTranscript) }] }],
    generationConfig: { maxOutputTokens: 512 },
  })
  if (r2.ok) {
    const out = r2.data?.candidates?.[0]?.content?.parts?.[0]?.text
    console.log('Status:', r2.status, 'OK')
    if (out) {
      const trimmed = out.trim()
      try {
        const parsed = JSON.parse(trimmed)
        console.log('Parsed voice result:', JSON.stringify(parsed, null, 2))
      } catch (e) {
        console.log('Raw text (first 300 chars):', trimmed.slice(0, 300))
        console.log('Parse error:', e.message)
      }
    } else {
      console.log('No text in response:', r2.data)
    }
  } else {
    console.log('Status:', r2.status, r2.status === 429 ? '(Too Many Requests)' : '')
    console.log('Error:', r2.data?.error?.message || r2.data?._raw || JSON.stringify(r2.data))
  }

  console.log('\n--- Test 3: Fallback model (gemini-1.5-flash-latest) ---')
  const r3 = await callGemini('gemini-1.5-flash-latest', {
    contents: [{ parts: [{ text: 'Reply with only this JSON: {"ok": true}' }] }],
  })
  if (r3.ok) {
    const out = r3.data?.candidates?.[0]?.content?.parts?.[0]?.text
    console.log('Status:', r3.status, 'OK – use this model if 2.0-flash has limit 0')
    if (out) console.log('Response:', out.slice(0, 100))
  } else {
    console.log('Status:', r3.status, r3.status === 429 ? '(rate limited)' : '')
    console.log('Error:', r3.data?.error?.message?.slice(0, 150) || '')
  }

  console.log('\n--- Done ---')
}

run().catch((e) => {
  console.error('Script error:', e.message)
  process.exit(1)
})
