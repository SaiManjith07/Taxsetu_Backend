import Button from '../ui/Button'
import { Play } from 'lucide-react'

export default function SimulationControl({ onRun }) {
  return (
    <Button onClick={onRun}>
      <Play className="w-4 h-4 mr-2" /> Run full cycle demo
    </Button>
  )
}
