import { BrowserWindow, ipcMain, session } from 'electron'
import * as path from 'path'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import { app } from 'electron'
import { getWindowIcon } from './icon'

let outputPath: string = ''

function getTempWavPath(): string {
  return path.join(app.getPath('temp'), `local-whisper-recording-${Date.now()}.wav`)
}

export interface RecorderOptions {
  deviceId?: string
  onStarted?: () => void
  onStopped?: (filePath: string) => void
  onError?: (error: string) => void
}

let captureWindow: BrowserWindow | null = null

export async function startRecording(options: RecorderOptions): Promise<void> {
  outputPath = getTempWavPath()

  // Auto-grant microphone permission
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
    } else {
      callback(false)
    }
  })

  captureWindow = new BrowserWindow({
    icon: getWindowIcon(),
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  // Remove any previous handlers to avoid "already registered" errors
  try { ipcMain.removeHandler('audio-data') } catch {}
  try { ipcMain.removeHandler('recording-started') } catch {}
  try { ipcMain.removeHandler('recording-error') } catch {}

  ipcMain.handle('audio-data', async (_event, base64Data: string) => {
    const buffer = Buffer.from(base64Data, 'base64')
    const webmPath = outputPath.replace('.wav', '.webm')
    fs.writeFileSync(webmPath, buffer)
    await convertToWav(webmPath, outputPath)
    cleanup()
    options.onStopped?.(outputPath)
  })

  ipcMain.handle('recording-started', () => {
    options.onStarted?.()
  })

  ipcMain.handle('recording-error', (_event, error: string) => {
    cleanup()
    options.onError?.(error)
  })

  // Load the capture page from the renderer (proper origin → getUserMedia works)
  const isDev = !app.isPackaged
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    captureWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/capture.html`)
  } else {
    captureWindow.loadFile(path.join(__dirname, '../renderer/capture.html'))
  }

  function cleanup() {
    try { ipcMain.removeHandler('audio-data') } catch {}
    try { ipcMain.removeHandler('recording-started') } catch {}
    try { ipcMain.removeHandler('recording-error') } catch {}
    if (captureWindow && !captureWindow.isDestroyed()) {
      captureWindow.close()
    }
    captureWindow = null
  }
}

export function stopRecording(): void {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.webContents.send('stop-recording')
  }
}

async function convertToWav(inputPath: string, outputWavPath: string): Promise<void> {
  // Use ffmpeg if available, otherwise use a simple PCM conversion
  return new Promise((resolve, reject) => {
    // Try ffmpeg first
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-y',
      outputWavPath
    ])

    ffmpeg.on('close', (code) => {
      // Clean up temp webm
      try { fs.unlinkSync(inputPath) } catch {}
      
      if (code === 0) {
        resolve()
      } else {
        // If ffmpeg not available, just rename (whisper.cpp can handle some formats)
        try {
          fs.renameSync(inputPath, outputWavPath)
          resolve()
        } catch (err) {
          reject(new Error('ffmpeg not found and fallback failed. Please install ffmpeg.'))
        }
      }
    })

    ffmpeg.on('error', () => {
      // ffmpeg not in PATH, try renaming
      try { 
        fs.renameSync(inputPath, outputWavPath)
        resolve()
      } catch (err) {
        reject(new Error('ffmpeg not found. Please install ffmpeg for audio conversion.'))
      }
    })
  })
}

export function cleanupTempFiles(): void {
  const tempDir = app.getPath('temp')
  try {
    const files = fs.readdirSync(tempDir)
    files.filter(f => f.startsWith('local-whisper-recording-')).forEach(f => {
      try { fs.unlinkSync(path.join(tempDir, f)) } catch {}
    })
  } catch {}
}
