import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import Button from '../components/ui/Button'
import { CheckCircle2, ExternalLink, FileText, Clock, AlertCircle, ArrowRight, Info } from 'lucide-react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

const ELIGIBILITY_CRITERIA = [
  {
    title: 'Turnover Threshold',
    description: 'Businesses with annual turnover exceeding ₹20 lakhs (₹10 lakhs for special category states)',
    icon: '💰',
  },
  {
    title: 'Inter-state Supply',
    description: 'Any business making inter-state supplies (regardless of turnover)',
    icon: '🚚',
  },
  {
    title: 'E-commerce Seller',
    description: 'Selling through e-commerce platforms (Amazon, Flipkart, etc.)',
    icon: '🛒',
  },
  {
    title: 'Voluntary Registration',
    description: 'Can register voluntarily even if below threshold',
    icon: '✅',
  },
]

const REQUIRED_DOCUMENTS = [
  'PAN Card of the business/owner',
  'Aadhaar Card of the owner/authorized signatory',
  'Proof of business address (Electricity bill, Rent agreement, etc.)',
  'Bank account details (Cancelled cheque or bank statement)',
  'Business registration certificate (if applicable)',
  'Digital signature certificate (DSC) or Aadhaar-based e-signature',
  'Photograph of the owner/authorized signatory',
  'Authorization letter (if applying through authorized person)',
]

const REGISTRATION_STEPS = [
  {
    step: 1,
    title: 'Visit GST Portal',
    description: 'Go to https://www.gst.gov.in and click on "Services" → "Registration" → "New Registration"',
    action: 'Open GST Portal',
    link: 'https://www.gst.gov.in',
  },
  {
    step: 2,
    title: 'Fill Part-A',
    description: 'Enter business details: Legal name, PAN, email, mobile number. You will receive a Temporary Reference Number (TRN)',
    action: null,
  },
  {
    step: 3,
    title: 'Fill Part-B',
    description: 'Using TRN, complete Part-B with business details, bank accounts, business activities, and upload documents',
    action: null,
  },
  {
    step: 4,
    title: 'Verification',
    description: 'Verify using Aadhaar OTP or Digital Signature Certificate (DSC)',
    action: null,
  },
  {
    step: 5,
    title: 'Receive GSTIN',
    description: 'After verification, you will receive your 15-digit GSTIN via email and SMS',
    action: null,
  },
]

export default function GSTRegistrationAssistance() {
  const { business, user } = useAuth()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [gstinEntered, setGstinEntered] = useState('')
  const [updating, setUpdating] = useState(false)
  const [registrationData, setRegistrationData] = useState({
    legalName: '',
    tradeName: '',
    pan: '',
    email: '',
    mobile: '',
    state: '',
    address: '',
    natureOfBusiness: '',
    bankAccount: '',
    ifsc: '',
  })
  const [csvPreview, setCsvPreview] = useState('')

  const handleRegistrationChange = (field, value) => {
    setRegistrationData((prev) => ({ ...prev, [field]: value }))
  }

  const buildCsvFromRegistration = () => {
    const headers = [
      'Legal Name',
      'Trade Name',
      'PAN',
      'Email',
      'Mobile',
      'State',
      'Address',
      'Nature of Business',
      'Bank Account',
      'IFSC',
    ]
    const values = [
      registrationData.legalName,
      registrationData.tradeName,
      registrationData.pan,
      registrationData.email,
      registrationData.mobile,
      registrationData.state,
      registrationData.address,
      registrationData.natureOfBusiness,
      registrationData.bankAccount,
      registrationData.ifsc,
    ]
    const escapeCell = (cell) => {
      if (cell == null) return ''
      const s = String(cell)
      if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const row = values.map(escapeCell).join(',')
    return `${headers.join(',')}\n${row}`
  }

  const handleGenerateCsv = () => {
    const csv = buildCsvFromRegistration()
    setCsvPreview(csv)
  }

  const handleDownloadCsv = () => {
    const csv = csvPreview || buildCsvFromRegistration()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gst-registration-draft.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleGoToMockPortal = () => {
    navigate('/gst-portal-mock', { state: { registrationData } })
  }

  const handleUpdateGSTIN = async () => {
    if (!gstinEntered || gstinEntered.length !== 15) {
      alert('Please enter a valid 15-character GSTIN')
      return
    }

    if (!user || !business) return

    setUpdating(true)
    try {
      const businessRef = doc(db, 'businesses', user.uid)
      await updateDoc(businessRef, {
        gstin: gstinEntered,
        gst_registered: true,
        state_code: gstinEntered.substring(0, 2),
      })
      alert('GSTIN updated successfully!')
      navigate('/dashboard')
    } catch (err) {
      alert('Failed to update GSTIN: ' + err.message)
    } finally {
      setUpdating(false)
    }
  }

  const handleSkipForNow = () => {
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/20 rounded-lg">
                <Info className="w-8 h-8 text-primary" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-text-primary mb-2">
                  🎯 GST Registration Assistance / GST पंजीकरण सहायता
                </h1>
                <p className="text-text-secondary">
                  हम आपकी GST पंजीकरण में मदद करेंगे / We'll help you register for GST
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Eligibility Check */}
        <Card>
          <CardHeader
            title="क्या आप GST के लिए पात्र हैं? / Are you eligible for GST?"
            subtitle="Check if your business needs GST registration"
          />
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ELIGIBILITY_CRITERIA.map((item, idx) => (
                <div key={idx} className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <h3 className="font-semibold text-text-primary mb-1">{item.title}</h3>
                      <p className="text-sm text-text-secondary">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-text-primary">
                <strong>Note:</strong> Special category states (Arunachal Pradesh, Assam, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim, Tripura, Himachal Pradesh, Uttarakhand) have a threshold of ₹10 lakhs.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Required Documents */}
        <Card>
          <CardHeader
            title="आवश्यक दस्तावेज / Required Documents"
            subtitle="Prepare these documents before starting registration"
          />
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {REQUIRED_DOCUMENTS.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-white/5 rounded">
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm text-text-secondary">{doc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Registration Steps */}
        <Card>
          <CardHeader
            title="पंजीकरण प्रक्रिया / Registration Process"
            subtitle="Step-by-step guide to register for GST"
          />
          <CardContent>
            <div className="space-y-4">
              {REGISTRATION_STEPS.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border transition-all ${
                    idx === currentStep
                      ? 'bg-primary/20 border-primary/50'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                        idx === currentStep
                          ? 'bg-primary text-white'
                          : idx < currentStep
                          ? 'bg-green-500 text-white'
                          : 'bg-white/10 text-text-secondary'
                      }`}
                    >
                      {idx < currentStep ? <CheckCircle2 className="w-6 h-6" /> : step.step}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-text-primary mb-1">{step.title}</h3>
                      <p className="text-sm text-text-secondary mb-3">{step.description}</p>
                      {step.action && step.link && (
                        <a
                          href={step.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          {step.action} <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                Previous
              </Button>
              <Button
                variant="primary"
                onClick={() => setCurrentStep(Math.min(REGISTRATION_STEPS.length - 1, currentStep + 1))}
                disabled={currentStep === REGISTRATION_STEPS.length - 1}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* New GST Registration draft (CSV + preview) */}
        <Card>
          <CardHeader
            title="GST Registration Draft (CSV)"
            subtitle="Fill all fields needed for a new GST registration. We’ll save it as a CSV and then use it to auto-fill a mock GST portal."
          />
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Legal Name of Business (as per PAN) *
                  </label>
                  <input
                    type="text"
                    value={registrationData.legalName}
                    onChange={(e) => handleRegistrationChange('legalName', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="ABC Traders Pvt Ltd"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Trade Name (if any)
                  </label>
                  <input
                    type="text"
                    value={registrationData.tradeName}
                    onChange={(e) => handleRegistrationChange('tradeName', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="ABC Supermart"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    PAN of Business / Proprietor *
                  </label>
                  <input
                    type="text"
                    value={registrationData.pan}
                    onChange={(e) => handleRegistrationChange('pan', e.target.value.toUpperCase())}
                    maxLength={10}
                    className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                    placeholder="ABCDE1234F"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Email (for OTP) *
                  </label>
                  <input
                    type="email"
                    value={registrationData.email}
                    onChange={(e) => handleRegistrationChange('email', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="founder@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Mobile (for OTP) *
                  </label>
                  <input
                    type="tel"
                    value={registrationData.mobile}
                    onChange={(e) => handleRegistrationChange('mobile', e.target.value)}
                    maxLength={10}
                    className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="9876543210"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    State / UT *
                  </label>
                  <input
                    type="text"
                    value={registrationData.state}
                    onChange={(e) => handleRegistrationChange('state', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Karnataka"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Principal Place of Business Address *
                  </label>
                  <textarea
                    value={registrationData.address}
                    onChange={(e) => handleRegistrationChange('address', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-h-[80px]"
                    placeholder="Door no., Building, Street, Locality, City, PIN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Nature of Business Activity *
                  </label>
                  <input
                    type="text"
                    value={registrationData.natureOfBusiness}
                    onChange={(e) => handleRegistrationChange('natureOfBusiness', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Retail trade / Services"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Bank Account Number *
                    </label>
                    <input
                      type="text"
                      value={registrationData.bankAccount}
                      onChange={(e) => handleRegistrationChange('bankAccount', e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                      placeholder="XXXXXXXXXXXX"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      IFSC Code *
                    </label>
                    <input
                      type="text"
                      value={registrationData.ifsc}
                      onChange={(e) => handleRegistrationChange('ifsc', e.target.value.toUpperCase())}
                      maxLength={11}
                      className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                      placeholder="SBIN0000000"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="primary" onClick={handleGenerateCsv}>
                Save as CSV & Show Preview
              </Button>
              <Button variant="outline" onClick={handleDownloadCsv} disabled={!registrationData.legalName}>
                Download CSV
              </Button>
              <Button variant="secondary" onClick={handleGoToMockPortal} disabled={!registrationData.legalName || !registrationData.pan}>
                Proceed to GST Portal Mock (Auto-fill)
              </Button>
            </div>

            {csvPreview && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  CSV Preview
                </label>
                <textarea
                  readOnly
                  value={csvPreview}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-xs font-mono text-text-primary min-h-[120px]"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card>
          <CardHeader
            title="उपयोगी लिंक / Useful Links"
            subtitle="Quick access to GST portal resources"
          />
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <a
                href="https://www.gst.gov.in"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div>
                  <h4 className="font-semibold text-text-primary">GST Portal</h4>
                  <p className="text-sm text-text-secondary">Official GST website</p>
                </div>
                <ExternalLink className="w-5 h-5 text-primary" />
              </a>
              <a
                href="https://www.gst.gov.in/help/user-guide"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div>
                  <h4 className="font-semibold text-text-primary">User Guide</h4>
                  <p className="text-sm text-text-secondary">Step-by-step tutorials</p>
                </div>
                <ExternalLink className="w-5 h-5 text-primary" />
              </a>
              <a
                href="https://www.gst.gov.in/help/video-tutorials"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div>
                  <h4 className="font-semibold text-text-primary">Video Tutorials</h4>
                  <p className="text-sm text-text-secondary">Watch registration videos</p>
                </div>
                <ExternalLink className="w-5 h-5 text-primary" />
              </a>
              <a
                href="https://www.gst.gov.in/help/faq"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div>
                  <h4 className="font-semibold text-text-primary">FAQ</h4>
                  <p className="text-sm text-text-secondary">Common questions answered</p>
                </div>
                <ExternalLink className="w-5 h-5 text-primary" />
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Update GSTIN Section */}
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader
            title="✅ पंजीकरण पूरा हो गया? / Registration Complete?"
            subtitle="If you've received your GSTIN, update it here"
          />
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Enter your GSTIN (15 characters)
                </label>
                <input
                  type="text"
                  value={gstinEntered}
                  onChange={(e) => setGstinEntered(e.target.value.toUpperCase())}
                  maxLength={15}
                  placeholder="29ABCDE1234F1Z5"
                  className="w-full px-4 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                {gstinEntered && gstinEntered.length === 15 && (
                  <p className="text-xs text-green-500 mt-1">✓ Valid GSTIN format</p>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="primary"
                  onClick={handleUpdateGSTIN}
                  disabled={!gstinEntered || gstinEntered.length !== 15 || updating}
                >
                  {updating ? 'Updating...' : 'Update GSTIN & Continue'}
                </Button>
                <Button variant="outline" onClick={handleSkipForNow}>
                  Skip for Now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Help Section */}
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-text-primary mb-2">Need Help?</h4>
                <p className="text-sm text-text-secondary mb-2">
                  If you face any issues during GST registration, you can:
                </p>
                <ul className="text-sm text-text-secondary space-y-1 list-disc list-inside">
                  <li>Contact GST Helpdesk: 1800-1200-232</li>
                  <li>Email: helpdesk@gst.gov.in</li>
                  <li>Visit your nearest GST Suvidha Kendra</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

