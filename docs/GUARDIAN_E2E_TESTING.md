# Guardian Agent – End-to-End Testing Guide

This guide walks you through testing **all** Guardian features in order.

---

## Prerequisites

1. **Environment**
   - `.env` has `VITE_GEMINI_API_KEY` set (needed for notice analysis, action plan, reply draft).
   - Firebase project has Authentication (Email/Password), Firestore, and Cloud Functions enabled.

2. **Deploy**
   - Deploy Firestore rules: `firebase deploy --only firestore:rules`
   - Deploy Functions (including Guardian): `firebase deploy --only functions`

3. **User**
   - Log in with a real user (not Demo). Demo mode skips Firestore/Guardian.
   - User has a business doc in `businesses/{uid}` with at least `gstin` and `business_name`.

4. **Run app**
   - `npm run dev` and open the app in the browser.

---

## Test 1: Compliance score and history

**What you’re testing:** Score load, display, and history.

**Steps:**

1. Go to **Guardian** (sidebar or **AI Agents** → GUARDIAN card).
2. Confirm the **Compliance Score** card shows a value (e.g. 94) and a label (e.g. उत्तम / Excellent).
3. Click **इतिहास देखें / View History**.
4. If the business has `compliance_history`, a list of events and score changes appears; otherwise the section stays empty.

**Pass:** Score and (when present) history display without errors.

---

## Test 2: Check portal for notices (no new notices)

**What you’re testing:** Cloud Function `checkGSTPortalNotices`, last check update, no notices flow.

**Steps:**

1. On **Guardian**, click **Check portal for notices / पोर्टल चेक करें**.
2. Wait for the request to finish (no spinner forever).
3. **Notices & Alerts** should still show “कोई पेंडिंग नोटिस नहीं!” (no pending notices).
4. In Firestore, open `businesses/{your-uid}` and confirm `last_notice_check` is updated to a recent timestamp.

**Pass:** Button completes, last check time updates, no notices (mock returns empty).

---

## Test 3: Simulate one notice (full pipeline)

**What you’re testing:** Notice injection, Gemini analysis, severity, action plan, reply draft, Firestore notice doc, compliance score update, notification.

**Steps:**

1. On **Guardian**, click **Simulate 1 notice (E2E test)**.
2. Wait 30–60 seconds (multiple Gemini calls: analysis, action plan, reply draft).
3. **Notices & Alerts** should show **one** new notice card with:
   - Type (e.g. mismatch)
   - Notice number (e.g. DRC-01A)
   - Severity badge (e.g. medium/high)
   - Summary in Hindi and English
   - Deadline and amount
4. **Compliance score** should drop (e.g. from 94 to ~84) because of a new notice.
5. Click **एक्शन प्लान देखें / View Action Plan** on the notice:
   - Steps in English (and optionally Hindi) should appear.
6. Click **रिप्लाई ड्राफ्ट / Reply Draft**:
   - Subject and body of the draft reply should appear.
7. In Firestore:
   - `notices` has one new doc with `business_id` = your uid, `status: 'pending'`, and fields `analysis`, `action_plan`, `reply_draft`.
   - `businesses/{uid}` has a lower `compliance_score` and new entries in `compliance_history`.
   - `notifications` has at least one doc with `type: 'guardian_alert'` for the notice.

**Pass:** One notice appears, score decreases, action plan and reply draft are visible, Firestore and notifications updated.

---

## Test 4: Compliance score update on filing

**What you’re testing:** Integration with Filer – filing a return updates Guardian’s compliance score.

**Steps:**

1. Note current **Compliance score** on Guardian (e.g. 94).
2. Go to **File Return** and complete the filing wizard (mock is fine: use “Start session”, submit CAPTCHA, OTP, fill form, submit EVC).
3. After “Return filed successfully”, go back to **Guardian** and refresh or re-open the page.
4. Score should increase slightly (e.g. +0.5 for `on_time_filing`), or at least not decrease from the filing itself.
5. Click **View History** and confirm an event like `on_time_filing` with a small positive score change.

**Pass:** Filing completes and Guardian score/history reflects the filing event.

---

## Test 5: Supplier filings check

**What you’re testing:** `checkSupplierFilings`, Cloud Function `checkSupplierFiling`, and optional alert/score update.

**Steps:**

1. Add a few **inward** invoices (e.g. via CSV or Voice Ledger) so you have invoices with `type: 'inward'` and `supplier_gstin` for the current period.
2. On **Guardian**, click **Check supplier filings / सप्लायर फाइलिंग चेक करें**.
3. Wait for the check to finish. An alert will show either “All X supplier(s) filed” or “Found X supplier(s) who may not have filed” with ITC at risk.
4. If any suppliers are reported as not filed, check **Notifications** for a Guardian alert and (optionally) a small compliance score change on Guardian.

**Pass:** No errors; alert reflects supplier count; if any not filed, notification (and optionally score change) occurs.

---

## Test 6: Daily cron (manual run)

**What you’re testing:** Scheduled function `dailyGuardianCheck` recalculates compliance score for all businesses.

**Steps:**

1. In Firebase Console → **Functions**, find **dailyGuardianCheck** and run it manually (if your project supports “Run” for scheduled functions), **or**
2. Use the Firebase CLI to invoke it (if you have an HTTP trigger wrapper), **or**
3. Wait until 9:00 AM IST and then check Firestore `businesses` for updated `compliance_score` and `compliance_score_updated_at`.

**Pass:** Score is recalculated from filings and pending notices (e.g. late filings and pending notices reduce the score).

---

## Test 7: Navigation and GUARDIAN card

**What you’re testing:** Routes and links to Guardian.

**Steps:**

1. Sidebar: click **Guardian** → Guardian dashboard opens at `/guardian`.
2. Go to **AI Agents**, then click the **GUARDIAN** card → same Guardian dashboard.
3. Refresh on `/guardian` → page still loads with your data.

**Pass:** Both sidebar and Agents card open the Guardian dashboard; URL is `/guardian`.

---

## Checklist summary

| # | Feature | How to test | Pass criteria |
|---|--------|-------------|----------------|
| 1 | Compliance score & history | Open Guardian, View History | Score and history (if any) show |
| 2 | Check portal (no notices) | “Check portal for notices” | Completes; `last_notice_check` updated |
| 3 | Full notice pipeline | “Simulate 1 notice (E2E test)” | One notice, analysis, plan, draft, score drop, notification |
| 4 | Filing → score | File return, then open Guardian | Score/history show on_time_filing |
| 5 | Supplier filings | Console or temp button + inward invoices | No errors; alert if suppliers not filed |
| 6 | Daily cron | Run at 9 AM IST or manually | Scores recalculated |
| 7 | Navigation | Sidebar + Agents card | Guardian opens at `/guardian` |

---

## Troubleshooting

- **“Business not found”**  
  Ensure you’re logged in with a user that has a document in `businesses/{uid}`.

- **“Missing or insufficient permissions”**  
  Deploy Firestore rules and ensure `notices` and `businesses` rules allow read/write for the authenticated user.

- **Simulate notice stays “Processing…” or fails**  
  Check `VITE_GEMINI_API_KEY` and Gemini quota. Open DevTools → Network/Console for errors. Ensure Cloud Function `checkGSTPortalNotices` is deployed and returns `test_with_sample_notice` payload when the client sends it.

- **Compliance score doesn’t change**  
  Confirm `businesses` rules allow update on `compliance_score` and `compliance_history`. Check browser console for errors when running “Simulate 1 notice” or after filing.

- **No notifications**  
  Check Firestore `notifications` collection and its security rules; ensure the client can create docs with `business_id` = request.auth.uid.
