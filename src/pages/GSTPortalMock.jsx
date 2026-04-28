import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import Button from '../components/ui/Button'

export default function GSTPortalMock() {
  const location = useLocation()
  const navigate = useNavigate()
  const data = location.state?.registrationData || {}

  const handleBack = () => {
    navigate('/gst-registration-assistance')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // In the real portal this would submit to GST backend.
    // Here we just simulate a successful redirect to an OTP / CAPTCHA flow.
    alert('Mock GST Portal: form submitted. Please enter OTP / CAPTCHA on the real portal.')
  }

  return (
    <div className="min-h-screen bg-[#0b1727] text-white px-4 py-6 md:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header bar similar to gst.gov.in */}
        <header className="bg-[#11233c] rounded-lg shadow-lg px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00a1ff] to-[#00e0ff] flex items-center justify-center font-bold text-lg">
              GST
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Goods and Services Tax Portal (Mock)</h1>
              <p className="text-xs text-blue-200">
                www.gst.gov.in &mdash; New Registration &mdash; This is a simulation screen for testing only.
              </p>
            </div>
          </div>
          <div className="text-xs md:text-sm text-blue-100">
            <div className="font-medium">Taxpayer / GST Practitioner</div>
            <div>Services &gt; Registration &gt; New Registration</div>
          </div>
        </header>

        <Card className="bg-[#102032] border border-blue-500/40">
          <CardHeader
            title="New Registration (Part A & Part B) - Mock"
            subtitle="We autofilled this form using your CSV data. Please review, enter OTP / CAPTCHA on real portal."
          />
          <CardContent className="space-y-6">
            {/* Part A */}
            <section className="space-y-4">
              <h2 className="font-semibold text-sm text-blue-200 uppercase tracking-wide">Part A - Basic details</h2>
              <div className="grid md:grid-cols-2 gap-4 text-xs md:text-sm">
                <div className="space-y-1">
                  <label className="block font-medium">I am a *</label>
                  <select className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2">
                    <option>Taxpayer</option>
                    <option>GST Practitioner</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">State / UT *</label>
                  <input
                    type="text"
                    className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2"
                    defaultValue={data.state || ''}
                    placeholder="Karnataka"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">Legal Name of Business (as per PAN) *</label>
                  <input
                    type="text"
                    className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2"
                    defaultValue={data.legalName || ''}
                    placeholder="ABC Traders Pvt Ltd"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">PAN of the Business *</label>
                  <input
                    type="text"
                    className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2 font-mono"
                    defaultValue={data.pan || ''}
                    placeholder="ABCDE1234F"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">Email Address *</label>
                  <input
                    type="email"
                    className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2"
                    defaultValue={data.email || ''}
                    placeholder="founder@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">Mobile Number *</label>
                  <input
                    type="tel"
                    className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2"
                    defaultValue={data.mobile || ''}
                    placeholder="9876543210"
                  />
                </div>
              </div>
            </section>

            {/* Part B */}
            <section className="space-y-4">
              <h2 className="font-semibold text-sm text-blue-200 uppercase tracking-wide">Part B - Business details</h2>
              <div className="grid md:grid-cols-2 gap-4 text-xs md:text-sm">
                <div className="space-y-1 md:col-span-2">
                  <label className="block font-medium">Trade Name (if any)</label>
                  <input
                    type="text"
                    className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2"
                    defaultValue={data.tradeName || ''}
                    placeholder="ABC Supermart"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">Constitution of Business *</label>
                  <select className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2">
                    <option>Proprietorship</option>
                    <option>Partnership</option>
                    <option>Private Limited Company</option>
                    <option>Public Limited Company</option>
                    <option>LLP</option>
                    <option>Others</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">Nature of Business Activity *</label>
                  <input
                    type="text"
                    className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2"
                    defaultValue={data.natureOfBusiness || ''}
                    placeholder="Retail trade / Services"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="block font-medium">Principal Place of Business Address *</label>
                  <textarea
                    className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2 min-h-[70px]"
                    defaultValue={data.address || ''}
                    placeholder="Door no., Building, Street, Locality, City, PIN"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">Bank Account Number *</label>
                  <input
                    type="text"
                    className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2 font-mono"
                    defaultValue={data.bankAccount || ''}
                    placeholder="XXXXXXXXXXXX"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">IFSC Code *</label>
                  <input
                    type="text"
                    className="w-full rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2 font-mono"
                    defaultValue={data.ifsc || ''}
                    placeholder="SBIN0000000"
                  />
                </div>
              </div>
            </section>

            {/* Captcha / OTP note */}
            <section className="space-y-3 text-xs md:text-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-32 h-12 bg-[#1b2940] border border-blue-500/40 rounded-md flex items-center justify-center text-lg tracking-widest font-mono">
                    MOCK
                  </div>
                  <div>
                    <p className="font-medium">CAPTCHA *</p>
                    <p className="text-blue-200 text-xs">
                      In real portal, you must type the CAPTCHA and OTP yourself.
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block font-medium">Enter CAPTCHA</label>
                  <input
                    type="text"
                    className="w-40 rounded-md bg-[#0b1727] border border-blue-500/40 px-3 py-2"
                    placeholder="Type here"
                  />
                </div>
              </div>
              <p className="text-blue-200">
                This is a mock screen. For real filing, you will be redirected to{' '}
                <span className="underline">https://www.gst.gov.in</span> and must complete OTP / CAPTCHA there.
              </p>
            </section>

            <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 justify-between pt-2">
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} type="button">
                  Back to TaxMitra
                </Button>
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => alert('Mock: OTP will be sent to your email / mobile.')}>
                  Generate OTP (Mock)
                </Button>
                <Button type="submit" variant="primary">
                  Proceed (Mock Submit)
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

