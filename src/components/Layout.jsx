import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard,
  FileText,
  Mic,
  Bot,
  Bell,
  FileSpreadsheet,
  Image,
  LogOut,
  FlaskConical,
  Calculator,
  CreditCard,
  Shield,
  Headphones,
} from 'lucide-react'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/invoices', label: 'All invoices', icon: FileText },
  { to: '/upload/photo', label: 'Photo Upload', icon: Image },
  { to: '/upload/csv', label: 'CSV / Excel', icon: FileSpreadsheet },
  { to: '/ledger/voice', label: 'Voice Ledger', icon: Mic },
  { to: '/calculator', label: 'Tax Calculation', icon: Calculator },
  { to: '/filing/start', label: 'File Return', icon: FileText },
  { to: '/agents', label: 'AI Agents', icon: Bot },
  { to: '/guardian', label: 'Guardian', icon: Shield },
  { to: '/narrator', label: 'Narrator', icon: Headphones },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings/autopay', label: 'Autopay Settings', icon: CreditCard },
]

export default function Layout() {
  const { user, business, signOut, demoMode, enableDemoMode, disableDemoMode } = useAuth()

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 glass border-r border-white/10 flex flex-col fixed h-full">
        <div className="p-4 border-b border-white/10">
          <h1 className="text-xl font-bold text-primary">TaxSetu</h1>
          <p className="text-xs text-text-secondary mt-1">GST Compliance</p>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/20 text-primary'
                    : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                }`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10 space-y-2">
          {demoMode ? (
            <button
              onClick={disableDemoMode}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-sm"
            >
              <FlaskConical className="w-4 h-4" /> Exit Demo
            </button>
          ) : (
            <button
              onClick={enableDemoMode}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30 text-secondary text-sm hover:bg-secondary/40"
            >
              <FlaskConical className="w-4 h-4" /> Try Demo
            </button>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-text-secondary hover:bg-white/5 hover:text-text-primary text-sm"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-64 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {business && (
            <div className="mb-4 text-sm text-text-secondary">
              {business.business_name} • {business.gstin}
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  )
}
