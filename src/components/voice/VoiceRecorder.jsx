import { useState, useRef, useEffect } from 'react'
import { Card, CardHeader, CardContent } from '../ui/Card'
import { Mic } from 'lucide-react'

export default function VoiceRecorder({ onTranscript }) {
  const [recording, setRecording] = useState(false)
  const [demoTranscript, setDemoTranscript] = useState('')
  const recognitionRef = useRef(null)

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onend = null
        recognitionRef.current.stop()
      }
    }
  }, [])

  const startRecording = async () => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)

    if (!SpeechRecognition) {
      const sample = 'मैंने आज ABC ट्रेडर्स से पचास हजार रुपए का माल खरीदा। GST इनक्लूडेड है।'
      setDemoTranscript(sample)
      onTranscript?.(sample)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'hi-IN'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript || ''
      setDemoTranscript(text)
      onTranscript?.(text)
    }

    recognition.onerror = () => {
      const sample = 'मैंने आज ABC ट्रेडर्स से पचास हजार रुपए का माल खरीदा। GST इनक्लूडेड है।'
      setDemoTranscript(sample)
      onTranscript?.(sample)
    }

    recognition.onend = () => {
      setRecording(false)
    }

    recognitionRef.current = recognition
    setRecording(true)
    recognition.start()
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setRecording(false)
  }

  const useSample = () => {
    const sample = 'मैंने आज ABC ट्रेडर्स से पचास हजार रुपए का माल खरीदा। GST इनक्लूडेड है।'
    setDemoTranscript(sample)
    onTranscript?.(sample)
  }

  return (
    <Card>
      <CardHeader title="Record or enter" subtitle="Hindi, Tamil, Telugu supported" />
      <CardContent className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          className={`p-4 rounded-full transition-all ${
            recording ? 'bg-danger animate-pulse' : 'bg-primary hover:bg-primary/90'
          }`}
        >
          <Mic className="w-8 h-8 text-white" />
        </button>
        <span className="text-text-secondary">{recording ? 'Recording... Click to stop' : 'Click mic to record'}</span>
        <button
          type="button"
          onClick={useSample}
          className="px-3 py-1.5 rounded-lg border border-white/20 text-sm text-text-secondary hover:bg-white/5"
        >
          Use sample (Hindi)
        </button>
        {demoTranscript && (
          <textarea
            className="w-full mt-2 min-h-[80px] px-3 py-2 rounded-lg bg-background border border-white/20 text-text-primary placeholder:text-text-secondary resize-y"
            placeholder="Or type/paste transcript..."
            value={demoTranscript}
            onChange={(e) => {
              setDemoTranscript(e.target.value)
              onTranscript?.(e.target.value)
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}
