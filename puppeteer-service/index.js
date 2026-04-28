/**
 * Puppeteer service for semi-automated GST return filing.
 * Deploy to Render.com and set VITE_FILER_SERVICE_URL in the frontend.
 */
import express from 'express'
import cors from 'cors'
import puppeteer from 'puppeteer'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3000

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

const sessions = new Map()

function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11)
}

// Start filing session: open GST portal login, capture CAPTCHA
app.post('/start-session', async (req, res) => {
  const { gstin, password } = req.body || {}
  if (!gstin || !password) {
    return res.status(400).json({ error: 'gstin and password required' })
  }
  const session_id = generateSessionId()
  try {
    // Run headless so only the embedded iframe in TaxSetu is the visible portal (no second window)
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    // Open mock GST login page served by this service
    await page.goto(`http://localhost:${PORT}/mock-login.html`, {
      waitUntil: 'networkidle2',
      timeout: 15000,
    })
    await page.type('#username', gstin)
    await page.type('#user_pass', password)
    const captchaEl = await page.$('#captcha_image') || await page.$('[id*="captcha"]')
    let captcha_image = null
    if (captchaEl) {
      captcha_image = await captchaEl.screenshot({ encoding: 'base64' })
    }
    sessions.set(session_id, { browser, page })
    res.json({
      session_id,
      captcha_image,
      status: 'awaiting_captcha',
    })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to start session' })
  }
})

// Submit CAPTCHA and proceed to OTP
app.post('/submit-captcha', async (req, res) => {
  const { session_id, captcha } = req.body || {}
  const session = sessions.get(session_id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const { page } = session
  try {
    // Navigate the portal window to the OTP page so it stays in sync with TaxSetu UI
    await page.goto(`http://localhost:${PORT}/mock-otp.html`, {
      waitUntil: 'networkidle2',
      timeout: 10000,
    })
    res.json({ status: 'awaiting_otp' })
  } catch (e) {
    console.error('submit-captcha error:', e)
    res.status(500).json({ error: e.message || 'submit-captcha failed' })
  }
})

// Submit OTP
app.post('/submit-otp', async (req, res) => {
  const { session_id, otp } = req.body || {}
  const session = sessions.get(session_id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const { page } = session
  try {
    // In the mock portal we simply navigate to the GSTR-3B page.
    await page.goto(`http://localhost:${PORT}/mock-gstr3b.html`, {
      waitUntil: 'networkidle2',
      timeout: 15000,
    })
    res.json({ status: 'logged_in' })
  } catch (e) {
    console.error('submit-otp error:', e)
    res.status(500).json({ error: e.message || 'submit-otp failed' })
  }
})

// Fill GSTR-3B form (simplified selectors; adjust to actual portal)
app.post('/fill-gstr3b', async (req, res) => {
  const { session_id, data } = req.body || {}
  const session = sessions.get(session_id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const { page } = session
  res.setHeader('Content-Type', 'application/x-ndjson')
  try {
    const write = (obj) => res.write(JSON.stringify(obj) + '\n')
    write({ progress: 10, action: 'Navigating to GSTR-3B' })
    await page.click('#returns_link').catch(() => {})
    await new Promise((r) => setTimeout(r, 2000))
    const t31 = data?.table_3_1 || {}
    write({ progress: 20, action: 'Filling Table 3.1' })
    await page.type('#table_3_1_taxable_value', String(t31.taxable_value || 0)).catch(() => {})
    await page.type('#table_3_1_cgst', String(t31.cgst || 0)).catch(() => {})
    await page.type('#table_3_1_sgst', String(t31.sgst || 0)).catch(() => {})
    await page.click('#table_3_1_save').catch(() => {})
    const t4 = data?.table_4 || {}
    write({ progress: 50, action: 'Filling Table 4' })
    await page.type('#table_4_itc_cgst', String(t4.itc_cgst || 0)).catch(() => {})
    await page.type('#table_4_itc_sgst', String(t4.itc_sgst || 0)).catch(() => {})
    await page.click('#table_4_save').catch(() => {})
    const t5 = data?.table_5 || {}
    write({ progress: 80, action: 'Filling Table 5' })
    await page.type('#table_5_net_payable', String(t5.net_payable || 0)).catch(() => {})
    await page.click('#table_5_save').catch(() => {})
    write({ progress: 100, action: 'Form filled' })
  } catch (e) {
    res.write(JSON.stringify({ error: e.message }) + '\n')
  }
  res.end()
})

// Get filled data from portal for verification
app.get('/get-filled-data/:session_id', async (req, res) => {
  const session = sessions.get(req.params.session_id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const { page } = session
  try {
    const data = await page.evaluate(() => {
      const get = (sel) => (document.querySelector(sel) || {}).value || ''
      return {
        table_3_1_taxable: get('#table_3_1_taxable_value'),
        table_3_1_cgst: get('#table_3_1_cgst'),
        table_3_1_sgst: get('#table_3_1_sgst'),
        net_payable: get('#table_5_net_payable'),
      }
    })
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Submit with EVC OTP
app.post('/submit-evc', async (req, res) => {
  const { session_id, evc_otp } = req.body || {}
  const session = sessions.get(session_id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const { page } = session
  try {
    // In the mock portal there is no real navigation on EVC submit.
    // Just click the buttons, type OTP, and read the ARN text.
    await page.click('#file_with_evc_btn').catch(() => {})
    await new Promise((r) => setTimeout(r, 500))
    await page.type('#evc_otp', evc_otp)
    await page.click('#evc_submit_btn').catch(() => page.click('button[type="submit"]'))
    await new Promise((r) => setTimeout(r, 500))
    const arn =
      (await page.$eval('#arn_number', (el) => el.innerText).catch(() => null)) ||
      'ARN-MOCK-' + Date.now().toString().slice(-6)
    res.json({ status: 'filed', arn })
  } catch (e) {
    console.error('submit-evc error:', e)
    res.status(500).json({ error: e.message || 'submit-evc failed' })
  }
})

// Download receipts
app.get('/download-receipts/:session_id', async (req, res) => {
  const session = sessions.get(req.params.session_id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  res.json({ arn_pdf_url: null, acknowledgment_url: null })
})

app.listen(PORT, () => console.log('Puppeteer filer service running on', PORT))
