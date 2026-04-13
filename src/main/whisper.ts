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

// Returns true if the model is too large for real-time streaming on CPU
export function isHeavyModel(modelId: string): boolean {
  return modelId.includes('large') || modelId.includes('medium')
}

// Returns a lightweight model ID suitable for live streaming, or null if none available
export function getLiveModelId(): string | null {
  if (isModelDownloaded('base')) return 'base'
  if (isModelDownloaded('tiny')) return 'tiny'
  return null
}

// --- Streaming mode: real-time mic capture + transcription via whisper-stream ---

export interface StreamOptions {
  modelId: string
  language?: string
  onPartial?: (fullTranscript: string) => void
  onError?: (error: string) => void
}

// Accumulated transcript: committed segments + current in-progress line
let committedSegments: string[] = []
let currentLine = ''

export function getFullTranscript(): string {
  const parts = [...committedSegments]
  if (currentLine) parts.push(currentLine)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
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

  const args = [
    '-m', modelPath,
    '-t', '4',
    '--step', '5000',
    '--length', '12000',
    '--keep', '3000',
    '--keep-context',
    '--vad-thold', '0.3'
  ]

  if (language && language !== 'auto') {
    args.push('-l', language)
  }

  console.log(`[whisper-stream] Starting: ${binaryPath} ${args.join(' ')}`)

  whisperProcess = spawn(binaryPath, args)

  committedSegments = []
  currentLine = ''
  let rawBuffer = ''

  whisperProcess.stdout?.on('data', (data: Buffer) => {
    rawBuffer += data.toString()

    // Strip ANSI escape sequences
    const clean = rawBuffer.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')

    // Split on newlines — \n marks a committed segment boundary
    const nlParts = clean.split('\n')

    // All parts except the last are committed (ended with \n)
    for (let i = 0; i < nlParts.length - 1; i++) {
      const segment = extractLastCR(nlParts[i])
      if (segment && !isNoise(segment)) {
        committedSegments.push(segment)
        console.log(`[whisper-stream] Committed segment: "${segment}"`)
      }
    }

    // The last part is the current in-progress line (may still be refined via \r)
    const inProgress = extractLastCR(nlParts[nlParts.length - 1])
    if (inProgress && !isNoise(inProgress)) {
      currentLine = inProgress
    }

    // Keep only the last (uncommitted) part in the buffer
    rawBuffer = nlParts[nlParts.length - 1]

    onPartial?.(getFullTranscript())
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
    // Commit any remaining text in the buffer
    if (rawBuffer) {
      const remaining = extractLastCR(rawBuffer.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''))
      if (remaining && !isNoise(remaining)) {
        committedSegments.push(remaining)
      }
      rawBuffer = ''
    }
    console.log(`[whisper-stream] Exited with code ${code}`)
    whisperProcess = null
  })
}

// whisper-stream uses \r to overwrite the current line with refinements.
// Extract the last (most refined) text after the final \r.
function extractLastCR(text: string): string {
  const parts = text.split('\r')
  // Walk backwards to find last non-empty part
  for (let i = parts.length - 1; i >= 0; i--) {
    const cleaned = parts[i].replace(/\[[\d:.]+\s*-->\s*[\d:.]+\]/g, '').trim()
    if (cleaned) return cleaned
  }
  return ''
}

function isNoise(text: string): boolean {
  if (!text) return true
  if (text === '[Start speaking]' || text === '[silence]') return true
  if (text.startsWith('whisper_') || text.startsWith('main:') || text.startsWith('init:') || text.startsWith('SDL_main:')) return true
  // Filter out text that is only brackets/punctuation
  if (/^\[.*\]$/.test(text)) return true
  return false
}

export function stopStream(): string {
  const transcript = getFullTranscript()
  if (whisperProcess) {
    whisperProcess.kill()
    whisperProcess = null
  }
  committedSegments = []
  currentLine = ''
  return transcript
}

// --- Batch mode: transcribe a file via whisper-cli ---

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
    '-np',
    '-t', '8'
  ]

  if (language && language !== 'auto') {
    args.push('-l', language)
  }

  console.log(`[whisper-cli] Starting: ${binaryPath} ${args.join(' ')}`)

  whisperProcess = spawn(binaryPath, args)
  let fullText = ''

  whisperProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()
    if (text) {
      fullText += text + ' '
      onPartial?.(fullText.trim())
    }
  })

  whisperProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString()
    console.log(`[whisper-cli] stderr: ${msg.trim()}`)
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

