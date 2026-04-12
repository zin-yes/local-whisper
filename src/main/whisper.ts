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
  onPartial?: (text: string) => void
  onError?: (error: string) => void
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
    '--step', '2000',
    '--length', '5000',
    '--keep', '500',
    '--keep-context',
    '--vad-thold', '0.5'
  ]

  if (language && language !== 'auto') {
    args.push('-l', language)
  }

  console.log(`[whisper-stream] Starting: ${binaryPath} ${args.join(' ')}`)

  whisperProcess = spawn(binaryPath, args)

  whisperProcess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n')
    for (const line of lines) {
      const cleaned = line.replace(/\[.*?\]/g, '').trim()
      if (cleaned && !cleaned.startsWith('whisper_') && !cleaned.startsWith('main:') && !cleaned.startsWith('init:')) {
        onPartial?.(cleaned)
      }
    }
  })

  whisperProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString()
    if (msg.includes('error') || msg.includes('failed')) {
      console.error(`[whisper-stream] Error: ${msg}`)
    }
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

export function stopStream(): void {
  if (whisperProcess) {
    whisperProcess.kill()
    whisperProcess = null
  }
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

