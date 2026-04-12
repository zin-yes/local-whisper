import { BrowserWindow } from 'electron'
import * as path from 'path'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import { app } from 'electron'

let recorderProcess: ChildProcess | null = null
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

// Use a hidden renderer window with Web Audio API to capture microphone
let captureWindow: BrowserWindow | null = null

export async function startRecording(options: RecorderOptions): Promise<void> {
  outputPath = getTempWavPath()

  // Create a hidden window for audio capture
  captureWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  const captureHtml = `
    <!DOCTYPE html>
    <html><body><script>
      let mediaRecorder = null;
      let audioChunks = [];

      async function startCapture() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              sampleRate: 16000
            }
          });
          
          mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          audioChunks = [];
          
          mediaRecorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
          };
          
          mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const buffer = await blob.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            
            // Send audio data back to main process
            window.electronAPI.sendAudioData(base64);
            
            stream.getTracks().forEach(t => t.stop());
          };
          
          mediaRecorder.start(100); // collect data every 100ms
          window.electronAPI.recordingStarted();
        } catch (err) {
          window.electronAPI.recordingError(err.message);
        }
      }

      function stopCapture() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      }

      // Listen for stop command
      window.electronAPI.onStopRecording(() => stopCapture());
      
      startCapture();
    </script></body></html>
  `

  const { ipcMain } = require('electron')

  // Set up one-time listeners for this capture session
  const audioDataHandler = async (_event: any, base64Data: string) => {
    // Convert webm to wav using ffmpeg or write raw
    const buffer = Buffer.from(base64Data, 'base64')
    fs.writeFileSync(outputPath.replace('.wav', '.webm'), buffer)

    // We need to convert webm to wav for whisper.cpp
    // For now, save as webm and convert
    await convertToWav(outputPath.replace('.wav', '.webm'), outputPath)
    
    cleanup()
    options.onStopped?.(outputPath)
  }

  const startedHandler = () => {
    options.onStarted?.()
  }

  const errorHandler = (_event: any, error: string) => {
    cleanup()
    options.onError?.(error)
  }

  function cleanup() {
    ipcMain.removeHandler('audio-data')
    ipcMain.removeHandler('recording-started')
    ipcMain.removeHandler('recording-error')
    if (captureWindow && !captureWindow.isDestroyed()) {
      captureWindow.close()
    }
    captureWindow = null
  }

  ipcMain.handle('audio-data', audioDataHandler)
  ipcMain.handle('recording-started', startedHandler)
  ipcMain.handle('recording-error', errorHandler)

  captureWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(captureHtml)}`)
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
