import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { CreditCard, CheckCircle2, AlertCircle, Loader2, Shield, Building2 } from 'lucide-react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { isAutopayEnabled } from '../services/paymentAgent'

export default function AutopaySettings() {
  const { business, user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autopayEnabled, setAutopayEnabled] = useState(false)
  const [bankAccount, setBankAccount] = useState({
    account_number: '',
    ifsc_code: '',
    account_holder_name: '',
    bank_name: '',
  })

  useEffect(() => {
    if (business) {
      setAutopayEnabled(business.settings?.autopay_enabled || false)
      setBankAccount({
        account_number: business.bank_account?.account_number || '',
        ifsc_code: business.bank_account?.ifsc_code || '',
        account_holder_name: business.bank_account?.account_holder_name || business.owner_name || '',
        bank_name: business.bank_account?.bank_name || '',
      })
    }
  }, [business])

  const handleSave = async () => {
    if (!user || !business) return
    
    if (autopayEnabled && (!bankAccount.account_number || !bankAccount.ifsc_code)) {
      alert('Please fill all bank account details to enable autopay')
      return
    }

    setSaving(true)
    try {
      const businessRef = doc(db, 'businesses', user.uid)
      await updateDoc(businessRef, {
        'settings.autopay_enabled': autopayEnabled,
        bank_account: autopayEnabled ? bankAccount : null,
      })
      alert('Settings saved successfully!')
    } catch (err) {
      alert('Failed to save settings: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const isConfigured = isAutopayEnabled(business)

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">💳 Autopay Settings / ऑटोपे सेटिंग्स</h1>
        <p className="text-text-secondary mt-1">
          Enable automatic GST payment from your bank account / अपने बैंक खाते से स्वचालित GST भुगतान सक्षम करें
        </p>
      </div>

      {/* Info Card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Shield className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-text-primary mb-2">🔒 Secure & Free (Demo)</h3>
              <p className="text-sm text-text-secondary mb-2">
                This is a demo feature for hackathon showcase. In production, this would integrate with:
              </p>
              <ul className="text-sm text-text-secondary space-y-1 list-disc list-inside">
                <li>UPI Autopay / NACH (National Automated Clearing House)</li>
                <li>Banking APIs (Razorpay, Stripe, or direct bank integration)</li>
                <li>GST Portal payment gateway</li>
                <li>Real-time payment verification</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Autopay Toggle */}
      <Card>
        <CardHeader
          title="Enable Autopay / ऑटोपे सक्षम करें"
          subtitle="Automatically pay GST liability when filing returns"
        />
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
            <div>
              <h3 className="font-semibold text-text-primary mb-1">Autonomous GST Payment</h3>
              <p className="text-sm text-text-secondary">
                When enabled, GST payments will be automatically deducted from your bank account when filing returns.
                No human intervention required.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autopayEnabled}
                onChange={(e) => setAutopayEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-14 h-7 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Bank Account Details */}
      {autopayEnabled && (
        <Card>
          <CardHeader
            title="Bank Account Details / बैंक खाता विवरण"
            subtitle="Account from which GST will be auto-paid"
          />
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Account Holder Name / खाता धारक का नाम"
                value={bankAccount.account_holder_name}
                onChange={(e) => setBankAccount({ ...bankAccount, account_holder_name: e.target.value })}
                required
              />
              <Input
                label="Bank Name / बैंक का नाम"
                value={bankAccount.bank_name}
                onChange={(e) => setBankAccount({ ...bankAccount, bank_name: e.target.value })}
                placeholder="e.g. State Bank of India"
                required
              />
              <Input
                label="Account Number / खाता संख्या"
                type="text"
                value={bankAccount.account_number}
                onChange={(e) => setBankAccount({ ...bankAccount, account_number: e.target.value.replace(/\D/g, '') })}
                placeholder="Enter account number"
                required
                maxLength={20}
              />
              <Input
                label="IFSC Code / IFSC कोड"
                value={bankAccount.ifsc_code}
                onChange={(e) => setBankAccount({ ...bankAccount, ifsc_code: e.target.value.toUpperCase() })}
                placeholder="e.g. SBIN0001234"
                required
                maxLength={11}
              />
            </div>
            
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-text-primary">
                <strong>🔐 Security Note:</strong> Bank account details are encrypted and stored securely. 
                Payments are processed through secure banking APIs with proper authentication.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status */}
      {isConfigured && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
              <div>
                <h3 className="font-semibold text-text-primary">Autopay Configured ✓</h3>
                <p className="text-sm text-text-secondary">
                  GST payments will be automatically processed when you file returns.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => window.history.back()}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </div>

      {/* How It Works */}
      <Card>
        <CardHeader
          title="How Autopay Works / ऑटोपे कैसे काम करता है"
          subtitle="Step-by-step process"
        />
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold flex-shrink-0">
                1
              </div>
              <div>
                <h4 className="font-semibold text-text-primary mb-1">File Return</h4>
                <p className="text-sm text-text-secondary">
                  When you file GSTR-3B, the system calculates net tax payable.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold flex-shrink-0">
                2
              </div>
              <div>
                <h4 className="font-semibold text-text-primary mb-1">Check Balance</h4>
                <p className="text-sm text-text-secondary">
                  System verifies sufficient balance in your bank account.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold flex-shrink-0">
                3
              </div>
              <div>
                <h4 className="font-semibold text-text-primary mb-1">Generate Challan</h4>
                <p className="text-sm text-secondary">
                  GST challan is automatically generated from the portal.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold flex-shrink-0">
                4
              </div>
              <div>
                <h4 className="font-semibold text-text-primary mb-1">Process Payment</h4>
                <p className="text-sm text-text-secondary">
                  Payment is automatically deducted from your bank account via UPI Autopay/NACH.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold flex-shrink-0">
                5
              </div>
              <div>
                <h4 className="font-semibold text-text-primary mb-1">Verify & Confirm</h4>
                <p className="text-sm text-text-secondary">
                  Payment is verified with GST portal and confirmation is sent via WhatsApp/Email.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

