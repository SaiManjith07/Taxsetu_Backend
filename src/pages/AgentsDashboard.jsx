import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import AgentCard from '../components/agents/AgentCard'
import AgentActivityFeed from '../components/agents/AgentActivityFeed'
import MasterPlannerCard from '../components/agents/MasterPlannerCard'
import SimulationControl from '../components/agents/SimulationControl'

const AGENTS = [
  { name: 'WATCHER', icon: '👁️', description: 'Monitors invoices, validates GSTINs, detects risks', status: 'Active', metrics: ['127 monitored', '3 risks', '2 min ago'] },
  { name: 'CALCULATOR', icon: '🧮', description: 'Computes GST, ITC, generates return data', status: 'Computing', metrics: ['18 returns', 'ITC done', '—'] },
  { name: 'FILER', icon: '📤', description: 'Autonomously files returns on GST portal', status: 'Scheduled', metrics: ['Mar 20', '18 filed', '100%'] },
  { name: 'GUARDIAN', icon: '🛡️', description: 'Monitors notices, drafts replies, risk score', status: 'Monitoring', metrics: ['0 pending', 'Low risk', '—'] },
  { name: 'NARRATOR', icon: '📢', description: 'Voice notifications in Hindi/Tamil/Telugu', status: 'Active', metrics: ['12 sent', 'Hindi', '1 hr ago'] },
]

export default function AgentsDashboard() {
  const [activities, setActivities] = useState([
    { agent: 'WATCHER', action: 'Validated GSTIN 29ABCDE1234F1Z5', status: 'success', time: '2 min ago' },
    { agent: 'CALCULATOR', action: 'Computed GSTR-3B for Feb 2025', status: 'success', time: '5 min ago' },
    { agent: 'FILER', action: 'GSTR-1 filed for Feb 2025', status: 'success', time: '1 hr ago' },
  ])

  const runSimulation = () => {
    setActivities((prev) => [
      { agent: 'MASTER PLANNER', action: 'Started full cycle', status: 'pending', time: 'Just now' },
      ...prev.slice(0, 9),
    ])
    setTimeout(() => {
      setActivities((prev) => [
        { agent: 'WATCHER', action: 'Processed 1 new invoice', status: 'success', time: 'Just now' },
        ...prev.map((a) => (a.agent === 'MASTER PLANNER' && a.time === 'Just now' ? { ...a, status: 'success' } : a)),
      ])
    }, 1500)
    setTimeout(() => {
      setActivities((prev) => [
        { agent: 'CALCULATOR', action: 'Updated ITC for current period', status: 'success', time: 'Just now' },
        ...prev.slice(0, 9),
      ])
    }, 3000)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">AI Agents</h1>
          <p className="text-text-secondary mt-1">Autonomous GST compliance agents</p>
        </div>
        <SimulationControl onRun={runSimulation} />
      </div>

      <MasterPlannerCard status="Active" tasksPlanned={24} autoExecuted={22} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {AGENTS.map((a) =>
          a.name === 'GUARDIAN' ? (
            <Link key={a.name} to="/guardian" className="block">
              <AgentCard {...a} />
            </Link>
          ) : (
            <AgentCard key={a.name} {...a} />
          )
        )}
      </div>

      <AgentActivityFeed activities={activities} />
    </div>
  )
}
