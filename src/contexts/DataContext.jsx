import { createContext, useContext, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { user, business, demoMode } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [filings, setFilings] = useState([])
  const [agentLogs, setAgentLogs] = useState([])
  const [notifications, setNotifications] = useState([])
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [complianceScore, setComplianceScore] = useState(94)
  const [taxSaved, setTaxSaved] = useState(18400)
  const [returnsFiled, setReturnsFiled] = useState({ filed: 18, total: 18 })

  const refreshData = useCallback(() => {
    // Placeholder; real impl would fetch from Firestore
    if (demoMode) {
      setComplianceScore(94)
      setTaxSaved(18400)
      setReturnsFiled({ filed: 18, total: 18 })
    }
  }, [demoMode])

  const value = {
    invoices,
    setInvoices,
    filings,
    setFilings,
    agentLogs,
    setAgentLogs,
    notifications,
    setNotifications,
    ledgerEntries,
    setLedgerEntries,
    complianceScore,
    setComplianceScore,
    taxSaved,
    setTaxSaved,
    returnsFiled,
    setReturnsFiled,
    refreshData,
    businessId: user?.uid || business?.business_id,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
