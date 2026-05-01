import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic, Square, Copy, Check, X, Clock, Package,
  AlertTriangle, CheckCircle2, Loader2, Trash2, Upload
} from 'lucide-react'
import type { TranscriptionResult, AppStatus } from '../../shared/types'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'

export default function Home() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [partialText, setPartialText] = useState('')
  const [history, setHistory] = useState<TranscriptionResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState(0)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const dragCounterRef = useRef(0)

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
    window.electronAPI.writeToClipboard(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const audioBufferToWav = (audioBuffer: AudioBuffer): Uint8Array => {
    const samples = audioBuffer.getChannelData(0)
    const byteLength = 44 + samples.length * 2
    const arrayBuffer = new ArrayBuffer(byteLength)
    const view = new DataView(arrayBuffer)

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, byteLength - 8, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM format
    view.setUint16(22, 1, true) // mono
    view.setUint32(24, 16000, true) // 16kHz sample rate
    view.setUint32(28, 32000, true) // byte rate
    view.setUint16(32, 2, true) // block align
    view.setUint16(34, 16, true) // 16-bit depth
    writeString(36, 'data')
    view.setUint32(40, samples.length * 2, true)

    let offset = 44
    for (let i = 0; i < samples.length; i++) {
      const clampedSample = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(offset, clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7FFF, true)
      offset += 2
    }

    return new Uint8Array(arrayBuffer)
  }

  const convertFileToWav = async (file: File): Promise<Uint8Array> => {
    const arrayBuffer = await file.arrayBuffer()
    const audioContext = new AudioContext()

    try {
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer)

      // Resample to 16kHz mono using OfflineAudioContext (required by whisper)
      const targetSampleRate = 16000
      const targetLength = Math.ceil(decodedBuffer.duration * targetSampleRate)
      const offlineContext = new OfflineAudioContext(1, targetLength, targetSampleRate)
      const source = offlineContext.createBufferSource()
      source.buffer = decodedBuffer
      source.connect(offlineContext.destination)
      source.start(0)

      const renderedBuffer = await offlineContext.startRendering()
      return audioBufferToWav(renderedBuffer)
    } finally {
      audioContext.close()
    }
  }

  const KNOWN_AUDIO_VIDEO_EXTENSIONS = new Set([
    'mp3', 'mp4', 'm4a', 'wav', 'ogg', 'flac', 'opus', 'mkv', 'webm',
    'mov', 'avi', 'aac', 'wma', 'aiff', 'aif'
  ])

  const handleFileDrop = async (file: File) => {
    if (isRecording || isTranscribing || isProcessingFile) return

    const isAudio = file.type.startsWith('audio/')
    const isVideo = file.type.startsWith('video/')
    // file.type can be empty on Windows for many formats (e.g. .flac, .opus, .mkv)
    // so fall back to extension check when the MIME type is missing
    const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? ''
    const hasKnownExtension = KNOWN_AUDIO_VIDEO_EXTENSIONS.has(fileExtension)

    if (!isAudio && !isVideo && !hasKnownExtension) {
      setError('Only audio and video files are supported.')
      setErrorKey(k => k + 1)
      return
    }

    setIsProcessingFile(true)

    try {
      const wavData = await convertFileToWav(file)
      setIsProcessingFile(false)
      await window.electronAPI.transcribeFile(wavData)
    } catch (err: unknown) {
      setIsProcessingFile(false)
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(`Failed to process file: ${message}`)
      setErrorKey(k => k + 1)
    }
  }

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault()
    dragCounterRef.current += 1
    if (dragCounterRef.current === 1) {
      setIsDraggingFile(true)
    }
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) {
      setIsDraggingFile(false)
    }
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
  }

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    dragCounterRef.current = 0
    setIsDraggingFile(false)

    const file = event.dataTransfer.files[0]
    if (file) {
      await handleFileDrop(file)
    }
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


      {/* File transcription drop zone */}
      <Card>
        <CardHeader>
          <CardTitle>Transcribe File</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-default',
              isDraggingFile
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40'
            )}
          >
            {isProcessingFile ? (
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Converting file...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drop an audio or video file to transcribe
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Supports MP3, MP4, WAV, M4A, OGG, and more
                </p>
              </div>
            )}
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
