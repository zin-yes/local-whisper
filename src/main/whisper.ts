import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

let whisperProcess: ChildProcess | null = null

function getWhisperBinaryPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(app.getAppPath(), 'resources', 'whisper', 'whisper-cli.exe')
  }
  return path.join(process.resourcesPath, 'whisper', 'whisper-cli.exe')
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

  const binaryPath = getWhisperBinaryPath()
  const modelPath = getModelPath(modelId)

  if (!fs.existsSync(binaryPath)) {
    onError?.(`Whisper binary not found at: ${binaryPath}. Please place whisper-cli.exe in resources/whisper/`)
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
    '--print-realtime',
    '-t', '4' // threads
  ]

  if (language && language !== 'auto') {
    args.push('-l', language)
  }

  console.log(`[whisper] Starting transcription: ${binaryPath} ${args.join(' ')}`)

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
    // whisper.cpp logs progress to stderr, only report actual errors
    if (msg.includes('error') || msg.includes('failed')) {
      console.error(`[whisper] Error: ${msg}`)
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
