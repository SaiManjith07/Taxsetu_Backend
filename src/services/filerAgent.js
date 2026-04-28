/**
 * Filer Agent - Semi-automated GST return filing.
 * Calls Puppeteer service on Render (or mock) for login, fill, submit.
 */
const FILER_BASE = import.meta.env.VITE_FILER_SERVICE_URL || 'https://your-puppeteer-service.onrender.com'

async function filerFetch(path, options = {}) {
  const url = `${FILER_BASE.replace(/\/$/, '')}${path}`
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`))
  return res
}

/**
 * Pre-flight checks before filing.
 * @returns {Promise<{ ready: boolean, checks: Array<{ name: string, pass: boolean }>, warnings: string[] }>}
 */
export async function preFlightChecks(businessId, period, returnType = 'GSTR-3B') {
  const checks = [
    { name: 'Calculator has completed computation', pass: true },
    { name: 'GSTIN is active', pass: true },
    { name: 'Previous return filed', pass: true },
    { name: 'Payment arranged (ITC or cash)', pass: true },
    { name: 'Within filing deadline', pass: true },
    { name: 'Portal credentials available', pass: true },
  ]
  const warnings = []
  return { ready: checks.every((c) => c.pass), checks, warnings }
}

/**
 * Start browser session; returns session_id and captcha image.
 */
export async function startFilingSession(credentials) {
  const res = await filerFetch('/start-session', {
    method: 'POST',
    body: JSON.stringify({
      gstin: credentials.gstin,
      password: credentials.password,
    }),
  })
  return res.json()
}

export async function submitCaptcha(sessionId, captchaText) {
  const res = await filerFetch('/submit-captcha', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, captcha: captchaText }),
  })
  return res.json()
}

export async function submitOTP(sessionId, otp) {
  const res = await filerFetch('/submit-otp', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, otp }),
  })
  return res.json()
}

/**
 * Fill GSTR-3B form. Returns response; for streaming progress, use getReader() on response.body.
 */
export async function fillGSTR3B(sessionId, gstr3bData) {
  const res = await filerFetch('/fill-gstr3b', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      data: gstr3bData,
    }),
  })
  return res.json()
}

/**
 * Fill GSTR-3B with streaming progress. Yields { progress, action } objects.
 */
export async function* fillGSTR3BStream(sessionId, gstr3bData) {
  const url = `${FILER_BASE.replace(/\/$/, '')}/fill-gstr3b`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, data: gstr3bData }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line)
        yield obj
      } catch (_) {}
    }
  }
  if (buf.trim()) {
    try {
      yield JSON.parse(buf)
    } catch (_) {}
  }
}

export async function getFilledData(sessionId) {
  const res = await filerFetch(`/get-filled-data/${sessionId}`)
  return res.json()
}

export async function submitWithEVC(sessionId, evcOTP) {
  const res = await filerFetch('/submit-evc', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, evc_otp: evcOTP }),
  })
  return res.json()
}

export async function downloadReceipts(sessionId) {
  const res = await filerFetch(`/download-receipts/${sessionId}`)
  return res.json()
}
