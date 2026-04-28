import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import DashboardHome from './pages/DashboardHome'
import PhotoUploadPage from './pages/PhotoUploadPage'
import CSVUploadPage from './pages/CSVUploadPage'
import VoiceLedgerPage from './pages/VoiceLedgerPage'
import AgentsDashboard from './pages/AgentsDashboard'
import NotificationsPage from './pages/NotificationsPage'
import InvoicesPage from './pages/InvoicesPage'
import CalculatorDashboard from './pages/CalculatorDashboard'
import FilingWizard from './pages/FilingWizard'
import GSTRegistrationAssistance from './pages/GSTRegistrationAssistance'
import GSTPortalMock from './pages/GSTPortalMock'
import AutopaySettings from './pages/AutopaySettings'
import GuardianDashboard from './pages/GuardianDashboard'
import NarratorPage from './pages/NarratorPage'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse text-text-secondary">Loading...</div></div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardHome />} />
        <Route path="upload/photo" element={<PhotoUploadPage />} />
        <Route path="upload/csv" element={<CSVUploadPage />} />
        <Route path="ledger/voice" element={<VoiceLedgerPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="agents" element={<AgentsDashboard />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="calculator" element={<CalculatorDashboard />} />
        <Route path="filing/start" element={<FilingWizard />} />
        <Route path="settings/autopay" element={<AutopaySettings />} />
        <Route path="guardian" element={<GuardianDashboard />} />
        <Route path="narrator" element={<NarratorPage />} />
      </Route>
      <Route path="/gst-registration-assistance" element={<ProtectedRoute><GSTRegistrationAssistance /></ProtectedRoute>} />
      <Route path="/gst-portal-mock" element={<ProtectedRoute><GSTPortalMock /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
