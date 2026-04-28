import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [gstin, setGstin] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [gstRegistered, setGstRegistered] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  // Extract state code from GSTIN if provided
  const handleGstinChange = (e) => {
    const value = e.target.value.toUpperCase()
    setGstin(value)
    if (value.length >= 2) {
      setStateCode(value.substring(0, 2))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    // Validation
    if (gstRegistered === 'yes' && !gstin) {
      setError('GSTIN is required if GST is registered')
      return
    }
    if (gstin && gstin.length !== 15) {
      setError('GSTIN must be exactly 15 characters')
      return
    }
    
    setLoading(true)
    try {
      await signUp(email, password, {
        business_name: businessName,
        gstin: gstRegistered === 'yes' ? gstin : '',
        owner_name: ownerName,
        owner_phone: ownerPhone,
        gst_registered: gstRegistered === 'yes',
        business_type: businessType,
        business_address: businessAddress,
        state_code: stateCode || (gstin.length >= 2 ? gstin.substring(0, 2) : ''),
      })
      // Redirect to GST registration assistance if not registered
      if (gstRegistered === 'no') {
        navigate('/gst-registration-assistance')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err.message || 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg glass rounded-2xl p-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-text-primary text-center mb-2">Create account</h1>
        <p className="text-text-secondary text-center text-sm mb-6">TaxSetu - GST Compliance</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-text-primary border-b border-white/10 pb-2">Account Details</h3>
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {/* Business Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-text-primary border-b border-white/10 pb-2 mt-6">Business Details</h3>
            <Input label="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
            
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                GST Registration Status <span className="text-danger">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gstRegistered"
                    value="yes"
                    checked={gstRegistered === 'yes'}
                    onChange={(e) => setGstRegistered(e.target.value)}
                    className="w-4 h-4 text-primary focus:ring-primary"
                  />
                  <span className="text-text-primary">Registered</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gstRegistered"
                    value="no"
                    checked={gstRegistered === 'no'}
                    onChange={(e) => setGstRegistered(e.target.value)}
                    className="w-4 h-4 text-primary focus:ring-primary"
                  />
                  <span className="text-text-primary">Not Registered</span>
                </label>
              </div>
            </div>

            {gstRegistered === 'yes' && (
              <>
                <Input 
                  label="GSTIN (15 chars)" 
                  value={gstin} 
                  onChange={handleGstinChange} 
                  maxLength={15}
                  placeholder="29ABCDE1234F1Z5"
                  required={gstRegistered === 'yes'}
                />
                {stateCode && (
                  <div className="text-xs text-text-secondary">
                    State Code: {stateCode}
                  </div>
                )}
              </>
            )}

            {gstRegistered === 'no' && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-text-primary mb-2">
                  <strong>💡 Don't worry!</strong> We'll help you register for GST after signup.
                </p>
                <p className="text-xs text-text-secondary">
                  You'll get step-by-step guidance, required documents list, and direct links to the GST portal.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Business Type
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Select business type</option>
                <option value="proprietorship">Proprietorship</option>
                <option value="partnership">Partnership</option>
                <option value="llp">LLP (Limited Liability Partnership)</option>
                <option value="private_limited">Private Limited</option>
                <option value="public_limited">Public Limited</option>
                <option value="huf">HUF (Hindu Undivided Family)</option>
                <option value="other">Other</option>
              </select>
            </div>

            <Input 
              label="Business Address" 
              value={businessAddress} 
              onChange={(e) => setBusinessAddress(e.target.value)}
              placeholder="Enter complete business address"
            />
          </div>

          {/* Owner Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-text-primary border-b border-white/10 pb-2 mt-6">Owner Details</h3>
            <Input label="Owner name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
            <Input 
              label="Owner Phone" 
              type="tel"
              value={ownerPhone} 
              onChange={(e) => setOwnerPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign up'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
