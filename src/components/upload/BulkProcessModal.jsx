import { useState } from 'react'
import { Card, CardHeader, CardContent } from '../ui/Card'
import Button from '../ui/Button'
import { Loader2, CheckCircle } from 'lucide-react'

export default function BulkProcessModal({ count, onConfirm, onCancel, onSuccessClose }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    setError('')
    setLoading(true)
    try {
      await onConfirm?.()
      setDone(true)
      setTimeout(() => {
        onSuccessClose?.()
        onCancel?.()
      }, 1500)
    } catch (e) {
      setError(e.message || 'Processing failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <Card className="max-w-md w-full animate-slide-up">
        <CardHeader
          title={done ? 'Done' : 'Process invoices?'}
          subtitle={
            done
              ? `${count} invoices saved. Watcher agent will process them.`
              : `${count} valid invoices will be saved and sent to Watcher agent.`
          }
        />
        <CardContent className="flex flex-col gap-3">
          {error && <p className="text-danger text-sm">{error}</p>}
          {done ? (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle className="w-5 h-5" /> Processed successfully
            </div>
          ) : (
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={onCancel} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={loading}>
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing...</>
                ) : (
                  'Process all'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
