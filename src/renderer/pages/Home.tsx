import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic, Square, Copy, Check, X, Clock, Package,
  AlertTriangle, CheckCircle2, Loader2, Trash2
} from 'lucide-react'
import type { TranscriptionResult, AppStatus } from '../../shared/types'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'

export default function Home() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [partialText, setPartialText] = useState('')
  const [history, setHistory] = useState<TranscriptionResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState(0)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  useEffect(() => {
    window.electronAPI.getAppStatus().then(setStatus)
    window.electronAPI.getHistory().then(setHistory)

    const unsubs = [
      window.electronAPI.onRecordingStatus((s) => {
        setIsRecording(s.isRecording)
        setIsTranscribing(s.isTranscribing || false)
      }),
      window.electronAPI.onTranscriptionPartial((text) => {
        setPartialText(text)
      }),
      window.electronAPI.onTranscriptionComplete((result) => {
        setPartialText('')
        setHistory(prev => [result, ...prev])
      }),
      window.electronAPI.onTranscriptionError((error) => {
        console.error('Transcription error:', error)
        setPartialText('')
      }),
      window.electronAPI.onError((error) => {
        setError(error)
        setErrorKey(k => k + 1)
        setTimeout(() => setError(null), 8000)
      })
    ]

    return () => unsubs.forEach(unsub => unsub())
  }, [])

  const handleToggleRecording = async () => {
    if (isRecording) {
      await window.electronAPI.stopRecording()
    } else {
      await window.electronAPI.startRecording()
    }
  }

  const handleClearHistory = async () => {
    await window.electronAPI.clearHistory()
    setHistory([])
  }

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const formatDuration = (ms: number) => `${Math.round(ms / 1000)}s`

  const ready = !!status?.modelsDownloaded?.length

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold tracking-tight">Home</h2>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            key={errorKey}
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="leading-relaxed">{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-destructive/60 hover:text-destructive transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status card */}
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge variant={ready ? 'success' : 'warning'}>
              {ready ? (
                <><CheckCircle2 className="h-3 w-3" /> Ready</>
              ) : (
                <><AlertTriangle className="h-3 w-3" /> No models</>
              )}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Model: <strong className="text-foreground">{status?.activeModel || 'None'}</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Recording control */}
      <Card>
        <CardHeader>
          <CardTitle>Recording</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <AnimatePresence>
            {isRecording && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-destructive/10">
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive recording-dot" />
                  <span className="text-sm text-destructive font-medium">Recording...</span>
                </div>
              </motion.div>
            )}

            {isTranscribing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground font-medium">Transcribing...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {partialText && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-3 bg-muted rounded-lg text-sm leading-relaxed text-muted-foreground italic"
              >
                {partialText}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3">
            <Button
              variant={isRecording ? 'destructive' : 'default'}
              onClick={handleToggleRecording}
              disabled={isTranscribing}
            >
              {isRecording ? (
                <><Square className="h-4 w-4" /> Stop Recording</>
              ) : (
                <><Mic className="h-4 w-4" /> Start Recording</>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              or press <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium">Ctrl+Shift+Space</kbd>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Transcription History</CardTitle>
            {history.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearHistory}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No transcriptions yet. Use the hotkey or button to start recording.
            </div>
          ) : (
            <div className="divide-y divide-border">
              <AnimatePresence initial={false}>
                {history.map((item, i) => (
                  <motion.div
                    key={`${item.timestamp}-${i}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="py-3 group">
                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-sm leading-relaxed">{item.text}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleCopy(item.text, i)}
                          title="Copy to clipboard"
                        >
                          {copiedIndex === i ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(item.timestamp)}
                        </span>
                        <span>{formatDuration(item.duration)}</span>
                        <span className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {item.model}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
