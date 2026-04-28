import { Volume2 } from 'lucide-react'

export default function MessageBubble({ hindi, english, type, read, audioUrl, onRead }) {
  return (
    <div
      className="flex justify-end"
      onMouseEnter={onRead}
    >
      <div className="max-w-[85%] rounded-lg rounded-br-md bg-success/90 px-4 py-2.5 text-left shadow">
        <p className="text-white text-sm leading-relaxed">{hindi}</p>
        <p className="text-white/80 text-xs mt-1">{english}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-white/60">{type?.replace('_', ' ')}</span>
          {audioUrl ? (
            <button type="button" className="p-1 rounded-full bg-white/20 text-white hover:bg-white/30">
              <Volume2 className="w-4 h-4" />
            </button>
          ) : (
            <span className="text-xs">{read ? '✓✓' : '✓'}</span>
          )}
        </div>
      </div>
    </div>
  )
}
