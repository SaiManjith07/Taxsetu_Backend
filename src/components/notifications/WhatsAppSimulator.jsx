import { Card } from '../ui/Card'
import MessageBubble from './MessageBubble'

export default function WhatsAppSimulator({ messages, onMarkRead }) {
  return (
    <Card className="max-w-md overflow-hidden">
      <div className="bg-secondary/30 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center text-white font-bold">
          T
        </div>
        <div>
          <p className="font-medium text-text-primary">TaxSetu</p>
          <p className="text-xs text-text-secondary">GST Compliance Bot</p>
        </div>
      </div>
      <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto bg-background/50">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            hindi={m.hindi}
            english={m.english}
            type={m.type}
            read={m.read}
            audioUrl={m.audio_url}
            onRead={() => onMarkRead?.(m.id)}
          />
        ))}
      </div>
    </Card>
  )
}
