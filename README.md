# TaxSetu – Autonomous GST Compliance Assistant

Production-grade web app for Indian MSMEs to manage GST compliance using AI: photo OCR, CSV/Excel upload, and voice-based ledger entry with cross-verification.

## Tech stack

- **Frontend:** React 18, Vite, TailwindCSS, Recharts, Lucide, React Hook Form, react-dropzone, xlsx
- **Backend:** Firebase (Auth, Firestore, Storage, Hosting, Cloud Functions)
- **AI:** Google Gemini (OCR, transcript parsing); optional Google STT/TTS for voice

## Setup

1. **Install dependencies**
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

2. **Environment (optional)**  
   Copy `.env.example` to `.env` and set `VITE_GEMINI_API_KEY` if you want client-side OCR/voice parsing. Otherwise use Firebase Functions (set `GEMINI_API_KEY` in Functions config).

3. **Run dev server**
   ```bash
   npm run dev
   ```

4. **Demo mode**  
   On the login page click **Try Demo (no login)** to use the app with pre-loaded demo data.

### Local setup (no git required)

```bash
npm install
cd functions && npm install && cd ..
npm run dev
```

## Build & deploy

```bash
npm run build
firebase deploy
```

## Project structure

- `src/` – React app (components, pages, contexts, hooks, lib, services)
- `functions/` – Firebase Cloud Functions (OCR, parseTranscript)
- `firestore.rules` / `storage.rules` – Security rules
- `firebase.json` – Firebase config (hosting, functions, rules)

## Features

- **Photo upload:** Invoice image → Gemini OCR → verification UI → save to Firestore. Use the prompt in `docs/OCR_TEST_IMAGE_PROMPT.md` to generate a test invoice image.
- **CSV/Excel:** Template download, parse, validate (GSTIN, amounts), bulk process
- **Voice ledger:** Record or type transcript → Gemini parses → save ledger entry
- **Compliance dashboard:** KPIs, 6-month trend, deadlines, recent filings, tax breakdown
- **AI agents:** Watcher, Calculator, Filer, Guardian, Narrator + Master Planner; simulation control
- **Notifications:** WhatsApp-style Hindi messages (with optional TTS)

## Firebase

Uses your existing project (`podnotes-eed71`). Enable **Authentication** (Email/Password, Google), **Firestore**, **Storage**, and **Cloud Functions** in the Firebase console. For Functions, set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in the Functions config.

**If you see "Missing or insufficient permissions"** after sign-up or login, deploy Firestore rules so the app can read/write the `businesses` collection:

```bash
firebase deploy --only firestore:rules
```

Until rules are deployed, the app will still let you sign in; the business profile may be empty. You can also use **Try Demo** to skip Firebase entirely.

---

## Sample GSTIN for sign-up

Use this **valid-format** GSTIN when creating an account (format only; not a real taxpayer):

| Field   | Value              |
|--------|---------------------|
| GSTIN  | **29ABCDE1234F1Z5** |
| State  | 29 (Kerala)         |
| Format | 2 digit state + 10 char PAN + 1 entity + Z + 1 checksum |

You can use it as-is for **Business name**: e.g. *Test Business*, **GSTIN**: `29ABCDE1234F1Z5`, **Owner name**: your name.

---

## Guide: Testing the Watcher agent

The **Watcher** agent monitors invoices, validates GSTINs, and detects risks. Here’s how to test it end-to-end.

### 1. Create an account

1. Open **Sign up**.
2. Use any email/password.
3. Fill:
   - **Business name:** Test Business (or Ramesh Textiles Pvt Ltd)
   - **GSTIN:** `29ABCDE1234F1Z5`
   - **Owner name:** Your name
4. Sign up and you’ll land on the Dashboard.

### 2. Send an invoice to the Watcher (two ways)

**Option A – Photo upload (OCR)**

1. Go to **Photo upload** (sidebar).
2. Upload an invoice image (JPEG/PNG) or use any sample invoice image.
3. Click **Extract with AI** (uses Gemini or demo mock).
4. In **Cross-verify & edit**, correct fields if needed and click **Confirm & save**.
5. The invoice is saved; the Watcher is designed to process it (in production this would trigger Firestore/Cloud Functions).

**Option B – CSV/Excel upload**

1. Go to **CSV / Excel** (sidebar).
2. Download the **Template** and keep the sample row, or add a row with:
   - **invoice_number:** INV-001  
   - **invoice_date:** 2025-02-01  
   - **supplier_name:** ABC Traders  
   - **supplier_gstin:** `29ABCDE1234F1Z5`  
   - **taxable_amount:** 10000  
   - **gst_rate:** 18  
   - **gst_amount:** 1800  
   - **total_amount:** 11800  
3. Upload the file. Check **Validation results** (valid/invalid).
4. Click **Process X valid invoices** → **Process all**.  
   Valid rows (with valid GSTIN format) are what the Watcher would consume.

### 3. See Watcher activity on the Agents dashboard

1. Go to **AI Agents** (sidebar).
2. You’ll see the **WATCHER** card (👁️) with status e.g. *Active* / *Monitoring* and metrics (invoices monitored, risks, last activity).
3. In **Activity feed**, Watcher entries look like:
   - *WATCHER: Validated GSTIN 29ABCDE1234F1Z5*
   - *WATCHER: Processed 1 new invoice*
4. Click **Run full cycle demo** to add more simulated Watcher (and other agent) actions in the feed.

### 4. Quick checklist

| Step                         | What to do                                      |
|-----------------------------|--------------------------------------------------|
| Sign up                     | Use GSTIN `29ABCDE1234F1Z5`                      |
| Feed an invoice             | Photo upload **or** CSV upload with valid GSTIN |
| Confirm / Process            | Confirm & save (photo) or Process all (CSV)     |
| Check Watcher               | Open **AI Agents** → WATCHER card + Activity feed |
| Simulate more activity      | **Run full cycle demo** on Agents page           |

Using the same GSTIN (`29ABCDE1234F1Z5`) in CSV rows ensures they pass validation and are counted as “valid” for the Watcher flow.

## License

Private / project use.
