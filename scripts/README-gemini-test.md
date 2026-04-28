# Gemini API test script

## Run

```bash
node scripts/test-gemini-api.js
```

Uses `VITE_GEMINI_API_KEY` from `.env` (same as the app). Or:

```bash
VITE_GEMINI_API_KEY=your_key node scripts/test-gemini-api.js
```

## What it tests

1. **Test 1** – Minimal call to `gemini-2.0-flash` (validates key and basic quota).
2. **Test 2** – Voice parsing request (same prompt as Voice Ledger “Parse with AI”).
3. **Test 3** – Fallback model `gemini-1.5-flash-latest` (in case 2.0 has no quota).

## Common results

| Status | Meaning |
|--------|--------|
| **200 OK** | Key and quota OK; voice parsing works. |
| **429 + "limit: 0"** | Free tier has **no** quota for that model. Fix: [Enable billing](https://ai.google.dev/gemini-api/docs/rate-limits) or use a key with quota; app will try other models in order. |
| **429 + "retry in Xs"** | Rate limit; wait and retry. |
| **404 model not found** | That model id isn’t available for this key; app will try next model. |
| **403** | Invalid key or API not enabled. |

## App model order

The app tries models in this order (see `src/services/geminiService.js`):

1. gemini-1.5-flash, gemini-1.5-flash-latest  
2. gemini-1.5-pro, gemini-1.5-pro-latest  
3. gemini-2.0-flash, gemini-2.5-pro, …

So if `gemini-2.0-flash` has limit 0, the app will use an earlier model that has quota.
