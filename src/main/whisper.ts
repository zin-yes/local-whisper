import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

let whisperProcess: ChildProcess | null = null

function getWhisperDir(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(app.getAppPath(), 'resources', 'whisper')
  }
  return path.join(process.resourcesPath, 'whisper')
}

function getStreamBinaryPath(): string {
  return path.join(getWhisperDir(), 'whisper-stream.exe')
}

function getCliBinaryPath(): string {
  return path.join(getWhisperDir(), 'whisper-cli.exe')
}

function getModelsDir(): string {
  return path.join(app.getPath('userData'), 'models')
}

export function getModelPath(modelId: string): string {
  return path.join(getModelsDir(), `ggml-${modelId}.bin`)
}

export function isModelDownloaded(modelId: string): boolean {
  return fs.existsSync(getModelPath(modelId))
}

export function getDownloadedModels(): string[] {
  const modelsDir = getModelsDir()
  if (!fs.existsSync(modelsDir)) return []
  return fs.readdirSync(modelsDir)
    .filter(f => f.startsWith('ggml-') && f.endsWith('.bin'))
    .map(f => f.replace('ggml-', '').replace('.bin', ''))
}

export function isStreamBinaryAvailable(): boolean {
  return fs.existsSync(getStreamBinaryPath())
}

export function isCliBinaryAvailable(): boolean {
  return fs.existsSync(getCliBinaryPath())
}

// --- Streaming mode: real-time mic capture + transcription via whisper-stream ---

export interface StreamOptions {
  modelId: string
  language?: string
  onPartial?: (currentWindow: string, fullTranscript: string) => void
  onError?: (error: string) => void
}

// Accumulated transcript segments from completed windows
let accumulatedSegments: string[] = []
let currentWindowText = ''

export function getFullTranscript(): string {
  const segments = [...accumulatedSegments]
  if (currentWindowText) segments.push(currentWindowText)
  return segments.join(' ').replace(/\s+/g, ' ').trim()
}

export function startStream(options: StreamOptions): void {
  const { modelId, language, onPartial, onError } = options

  const binaryPath = getStreamBinaryPath()
  const modelPath = getModelPath(modelId)

  if (!fs.existsSync(binaryPath)) {
    onError?.(`whisper-stream.exe not found at: ${binaryPath}`)
    return
  }
  if (!fs.existsSync(modelPath)) {
    onError?.(`Model not found: ${modelId}. Please download it from Settings.`)
    return
  }

  // Adjust streaming parameters based on model size
  // Larger models need longer step intervals to keep up with real-time
  const isLargeModel = modelId.includes('large') || modelId.includes('medium')
  const step = isLargeModel ? '4000' : '2000'
  const length = isLargeModel ? '8000' : '5000'
  const threads = isLargeModel ? '8' : '4'

  const args = [
    '-m', modelPath,
    '-t', threads,
    '--step', step,
    '--length', length,
    '--keep', '500',
    '--keep-context',
    '--vad-thold', '0.5'
  ]

  if (language && language !== 'auto') {
    args.push('-l', language)
  }

  console.log(`[whisper-stream] Starting: ${binaryPath} ${args.join(' ')}`)

  whisperProcess = spawn(binaryPath, args)

  accumulatedSegments = []
  currentWindowText = ''
  let lastCleanedText = ''

  whisperProcess.stdout?.on('data', (data: Buffer) => {
    const raw = data.toString()
    // Strip all ANSI escape sequences (cursor moves, erase line, colors, etc.)
    const stripped = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // whisper-stream uses \r to overwrite lines, split on both \r and \n
    const lines = stripped.split(/[\r\n]+/)
    for (const line of lines) {
      // Strip whisper timestamp brackets like [00:00:00.000 --> 00:00:05.000]
      const cleaned = line.replace(/\[[\d:.]+\s*-->\s*[\d:.]+\]/g, '').trim()
      if (!cleaned) continue
      // Filter out status messages and init noise
      if (cleaned.startsWith('whisper_') || cleaned.startsWith('main:') || cleaned.startsWith('init:')) continue
      if (cleaned === '[Start speaking]' || cleaned === '[silence]') continue

      // Detect new segment: if the new text doesn't start with/contain the previous text,
      // it's likely a new window — commit the previous window text
      if (lastCleanedText && cleaned !== lastCleanedText) {
        const overlap = findOverlap(lastCleanedText, cleaned)
        if (overlap < lastCleanedText.length * 0.3) {
          // Significantly different text — new window, commit the old one
          if (lastCleanedText) {
            accumulatedSegments.push(lastCleanedText)
          }
        }
      }

      lastCleanedText = cleaned
      currentWindowText = cleaned
      onPartial?.(cleaned, getFullTranscript())
    }
  })

  whisperProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString()
    console.log(`[whisper-stream] stderr: ${msg.trim()}`)
  })

  whisperProcess.on('error', (err) => {
    whisperProcess = null
    onError?.(`Failed to start whisper-stream: ${err.message}`)
  })

  whisperProcess.on('close', (code) => {
    console.log(`[whisper-stream] Exited with code ${code}`)
    whisperProcess = null
  })
}

export function stopStream(): string {
  const transcript = getFullTranscript()
  if (whisperProcess) {
    whisperProcess.kill()
    whisperProcess = null
  }
  accumulatedSegments = []
  currentWindowText = ''
  return transcript
}

// Find how many characters at the end of `prev` overlap with the start of `next`
function findOverlap(prev: string, next: string): number {
  const maxCheck = Math.min(prev.length, next.length)
  let best = 0
  for (let i = 1; i <= maxCheck; i++) {
    if (prev.endsWith(next.substring(0, i))) {
      best = i
    }
  }
  return best
}

// --- Batch mode: transcribe a file via whisper-cli (fallback) ---

export interface TranscribeOptions {
  audioPath: string
  modelId: string
  language?: string
  onPartial?: (text: string) => void
  onComplete?: (text: string) => void
  onError?: (error: string) => void
}

export function transcribe(options: TranscribeOptions): void {
  const { audioPath, modelId, language, onPartial, onComplete, onError } = options

  const binaryPath = getCliBinaryPath()
  const modelPath = getModelPath(modelId)

  if (!fs.existsSync(binaryPath)) {
    onError?.(`whisper-cli.exe not found at: ${binaryPath}`)
    return
  }
  if (!fs.existsSync(modelPath)) {
    onError?.(`Model not found: ${modelId}. Please download it from Settings.`)
    return
  }

  const args = [
    '-m', modelPath,
    '-f', audioPath,
    '--no-timestamps',
    '--print-progress',
    '-np',
    '-t', '4'
  ]

  if (language && language !== 'auto') {
    args.push('-l', language)
  }

  console.log(`[whisper-cli] Starting: ${binaryPath} ${args.join(' ')}`)

  whisperProcess = spawn(binaryPath, args)
  let fullText = ''

  whisperProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      fullText += text + ' '
      onPartial?.(fullText.trim())
    }
  })

  whisperProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString()
    const progressMatch = msg.match(/progress\s*=\s*(\d+)%/)
    if (progressMatch) {
      onPartial?.(`⏳ Transcribing... ${progressMatch[1]}%`)
    } else if (msg.includes('error') || msg.includes('failed')) {
      console.error(`[whisper-cli] Error: ${msg}`)
    }
  })

  whisperProcess.on('close', (code) => {
    whisperProcess = null
    if (code === 0) {
      onComplete?.(fullText.trim())
    } else {
      onError?.(`Whisper process exited with code ${code}`)
    }
  })

  whisperProcess.on('error', (err) => {
    whisperProcess = null
    onError?.(`Failed to start whisper: ${err.message}`)
  })
}

export function cancelTranscription(): void {
  if (whisperProcess) {
    whisperProcess.kill()
    whisperProcess = null
  }
}

