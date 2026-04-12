import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getSettings, setSettings, getHistory, addToHistory, clearHistory } from './store'
import { registerHotkey, unregisterHotkey, resetRecordingState } from './hotkey'
import { startRecording, stopRecording, cleanupTempFiles } from './recorder'
import { transcribe, cancelTranscription, isModelDownloaded, getDownloadedModels } from './whisper'
import { listModels, downloadModel, deleteModel } from './models'
import { createOverlayWindow, showOverlay, updateOverlay, hideOverlay } from './overlay'
import { injectText } from './injector'
import { IPC_CHANNELS, AppStatus, TranscriptionResult } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isTranscribing = false

function getWhisperBinaryPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(app.getAppPath(), 'resources', 'whisper', 'whisper-cli.exe')
  }
  return path.join(process.resourcesPath, 'whisper', 'whisper-cli.exe')
}

function showError(error: string): void {
  console.error(`[main] Error: ${error}`)
  mainWindow?.webContents.send(IPC_CHANNELS.SHOW_ERROR, error)
}

function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#e0e0e0',
      height: 36
    },
    backgroundColor: '#1a1a2e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    // Minimize to tray instead of closing
    event.preventDefault()
    mainWindow?.hide()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function createTray(): void {
  // Create a simple tray icon (16x16 blue circle)
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Local Whisper',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        mainWindow?.destroy()
        app.quit()
      }
    }
  ])

  tray.setToolTip('Local Whisper')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}

function setupIPC(): void {
  // Settings
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => getSettings())
  ipcMain.handle(IPC_CHANNELS.SET_SETTINGS, (_event, settings) => {
    const updated = setSettings(settings)
    // Re-register hotkey with new settings
    unregisterHotkey()
    setupHotkey()
    mainWindow?.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, updated)
    return updated
  })

  // Models
  ipcMain.handle(IPC_CHANNELS.LIST_MODELS, () => listModels())
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_MODEL, async (_event, modelId: string) => {
    try {
      const filePath = await downloadModel(modelId, (percent) => {
        mainWindow?.webContents.send(IPC_CHANNELS.DOWNLOAD_PROGRESS, { modelId, percent })
      })
      return { success: true, filePath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle(IPC_CHANNELS.DELETE_MODEL, (_event, modelId: string) => deleteModel(modelId))
  ipcMain.handle(IPC_CHANNELS.GET_ACTIVE_MODEL, () => getSettings().activeModel)
  ipcMain.handle(IPC_CHANNELS.SET_ACTIVE_MODEL, (_event, modelId: string) => {
    setSettings({ activeModel: modelId })
    return modelId
  })

  // History
  ipcMain.handle(IPC_CHANNELS.GET_HISTORY, () => getHistory())
  ipcMain.handle(IPC_CHANNELS.CLEAR_HISTORY, () => {
    clearHistory()
    return true
  })

  // App status
  ipcMain.handle(IPC_CHANNELS.GET_APP_STATUS, (): AppStatus => ({
    isRecording: false, // Will be updated by recording flow
    isTranscribing,
    activeModel: getSettings().activeModel,
    modelsDownloaded: getDownloadedModels()
  }))

  // Manual recording controls (from UI)
  ipcMain.handle(IPC_CHANNELS.START_RECORDING, () => handleStartRecording())
  ipcMain.handle(IPC_CHANNELS.STOP_RECORDING, () => handleStopRecording())

  // App controls
  ipcMain.handle(IPC_CHANNELS.QUIT_APP, () => {
    mainWindow?.destroy()
    app.quit()
  })
  ipcMain.handle(IPC_CHANNELS.SHOW_WINDOW, () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function handleStartRecording(): void {
  const settings = getSettings()

  // Validate whisper binary exists
  const binaryPath = getWhisperBinaryPath()
  if (!fs.existsSync(binaryPath)) {
    const error = `❌ Whisper binary not found. Please ensure whisper-cli.exe is in the resources/whisper/ folder. Expected at: ${binaryPath}`
    showError(error)
    mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false })
    return
  }

  // Validate a model is selected and downloaded
  if (!settings.activeModel) {
    const error = '❌ No model selected. Please download and select a model in Settings.'
    showError(error)
    mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false })
    return
  }

  if (!isModelDownloaded(settings.activeModel)) {
    const error = `❌ Model "${settings.activeModel}" is not downloaded. Please download it from Settings before recording.`
    showError(error)
    mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false })
    return
  }

  mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: true })

  if (settings.overlayEnabled) {
    showOverlay('🎙️ Listening...')
  }

  startRecording({
    onStarted: () => {
      console.log('[main] Recording started')
    },
    onStopped: (filePath) => {
      console.log(`[main] Recording stopped, file: ${filePath}`)
      handleTranscription(filePath)
    },
    onError: (error) => {
      console.error(`[main] Recording error: ${error}`)
      hideOverlay()
      // Parse error to provide user-friendly message
      let userError = error
      if (error.includes('NotAllowedError') || error.includes('Permission denied')) {
        userError = '❌ Microphone access denied. Please enable microphone permissions in your system settings.'
      } else if (error.includes('NotFoundError') || error.includes('no device')) {
        userError = '❌ No microphone found. Please connect a microphone and try again.'
      } else if (error.includes('ffmpeg')) {
        userError = '❌ Audio conversion failed. Please install ffmpeg to use this app: https://ffmpeg.org/download.html'
      } else {
        userError = `❌ Recording error: ${error}`
      }
      showError(userError)
      mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false })
      resetRecordingState()
    }
  })
}

function handleStopRecording(): void {
  stopRecording()
  mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false })
}

function handleTranscription(audioPath: string): void {
  const settings = getSettings()
  isTranscribing = true

  if (settings.overlayEnabled) {
    updateOverlay('⏳ Transcribing...')
  }

  mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false, isTranscribing: true })

  const startTime = Date.now()

  transcribe({
    audioPath,
    modelId: settings.activeModel,
    language: settings.language,
    onPartial: (text) => {
      if (settings.overlayEnabled) {
        updateOverlay(text)
      }
      mainWindow?.webContents.send(IPC_CHANNELS.TRANSCRIPTION_PARTIAL, text)
    },
    onComplete: async (text) => {
      isTranscribing = false
      hideOverlay()

      if (text.trim()) {
        // Inject text into focused field
        await injectText(text.trim())

        // Save to history
        const result: TranscriptionResult = {
          text: text.trim(),
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          model: settings.activeModel
        }
        addToHistory(result)

        mainWindow?.webContents.send(IPC_CHANNELS.TRANSCRIPTION_COMPLETE, result)
      }

      mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false, isTranscribing: false })
    },
    onError: (error) => {
      isTranscribing = false
      hideOverlay()
      // Parse error to provide user-friendly message
      let userError = error
      if (error.includes('Whisper binary not found')) {
        userError = '❌ Whisper binary not found. Please ensure whisper-cli.exe is in the resources/whisper/ folder.'
      } else if (error.includes('Model not found')) {
        userError = '❌ Selected model not found. Please download it from Settings.'
      } else if (error.includes('exited with code')) {
        userError = '❌ Transcription failed. The whisper process crashed or encountered an error.'
      } else if (error.includes('Failed to start whisper')) {
        userError = '❌ Failed to start transcription. Please check your installation.'
      } else {
        userError = `❌ Transcription error: ${error}`
      }
      showError(userError)
      mainWindow?.webContents.send(IPC_CHANNELS.TRANSCRIPTION_ERROR, error)
      mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false, isTranscribing: false })
    }
  })
}

function setupHotkey(): void {
  registerHotkey((action) => {
    if (action === 'start') {
      handleStartRecording()
    } else {
      handleStopRecording()
    }
  })
}

// App lifecycle
app.whenReady().then(() => {
  createMainWindow()
  createTray()
  createOverlayWindow()
  setupIPC()
  setupHotkey()

  console.log('[main] Local Whisper started')
})

app.on('window-all-closed', () => {
  // Don't quit on Windows when all windows closed (tray app)
})

app.on('before-quit', () => {
  unregisterHotkey()
  cancelTranscription()
  cleanupTempFiles()
  mainWindow?.destroy()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})
