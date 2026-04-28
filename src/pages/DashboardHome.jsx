import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardContent } from '../components/ui/Card'
import StatsCards from '../components/dashboard/StatsCards'
import ComplianceChart from '../components/dashboard/ComplianceChart'
import UpcomingDeadlines from '../components/dashboard/UpcomingDeadlines'
import RecentFilings from '../components/dashboard/RecentFilings'
import TaxBreakdown from '../components/dashboard/TaxBreakdown'
import WhatsAppNotifications from '../components/WhatsAppNotifications'
import WorkflowStatusWidget from '../components/dashboard/WorkflowStatusWidget'
import Button from '../components/ui/Button'
import { Image, Calculator, FileText, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { isAutopayEnabled } from '../services/paymentAgent'

export default function DashboardHome() {
  const { user, business } = useAuth()
  const businessId = user?.uid
  const isNotRegistered = business && !business.gstin
  const autopayEnabled = isAutopayEnabled(business)

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Compliance Dashboard</h1>
        <p className="text-text-secondary mt-1">Overview of your GST compliance status</p>
      </div>

      {/* Autopay Status */}
      {autopayEnabled && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
                <div>
                  <h3 className="font-semibold text-text-primary">💳 Autopay Active</h3>
                  <p className="text-sm text-text-secondary">
                    GST payments will be automatically processed when you file returns
                  </p>
                </div>
              </div>
              <Link to="/settings/autopay">
                <Button variant="outline" size="sm">Manage</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* GST Registration Reminder */}
      {isNotRegistered && (
        <Card className="border-orange-500/30 bg-orange-500/10">
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <AlertCircle className="w-6 h-6 text-orange-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-text-primary mb-1">
                    GST Registration Pending / GST पंजीकरण लंबित
                  </h3>
                  <p className="text-sm text-text-secondary mb-3">
                    Complete your GST registration to start filing returns and claim ITC. We'll guide you through the entire process.
                  </p>
                  <Link to="/gst-registration-assistance">
                    <Button variant="primary" size="sm">
                      Get Registration Help / पंजीकरण सहायता प्राप्त करें
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap gap-3">
        <Link to="/upload/photo" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors text-sm font-medium">
          <Image className="w-4 h-4" /> चालान जोड़ें / Add invoice
        </Link>
        <Link to="/calculator" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors text-sm font-medium">
          <Calculator className="w-4 h-4" /> टैक्स कैलकुलेशन / Tax Calculation
        </Link>
        <Link to="/filing/start" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors text-sm font-medium">
          <FileText className="w-4 h-4" /> रिटर्न फाइल करें / File Return
        </Link>
      </div>
      <StatsCards />

      {businessId && <WorkflowStatusWidget businessId={businessId} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ComplianceChart />
        </div>
        <div>
          <TaxBreakdown />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UpcomingDeadlines />
        <RecentFilings />
      </div>

      {/* Narrator: WhatsApp-style recent updates */}
      {businessId && (
        <div className="notifications-widget">
          <h3 className="text-lg font-semibold text-text-primary mb-3">📢 Recent Updates / हाल की सूचनाएं</h3>
          <WhatsAppNotifications businessId={businessId} maxItems={5} />
        </div>
      )}
    </div>
  )
}
