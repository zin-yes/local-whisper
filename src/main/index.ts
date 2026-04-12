import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getSettings, setSettings, getHistory, addToHistory, clearHistory } from './store'
import { registerHotkey, unregisterHotkey, resetRecordingState } from './hotkey'
import {
  startStream, stopStream, transcribe,
  isStreamBinaryAvailable, isCliBinaryAvailable, isHeavyModel,
  isModelDownloaded, getDownloadedModels, cancelTranscription
} from './whisper'
import { startRecording, stopRecording, cleanupTempFiles } from './recorder'
import { listModels, downloadModel, deleteModel } from './models'
import { createOverlayWindow, showOverlay, updateOverlay, hideOverlay } from './overlay'
import { injectText } from './injector'
import { IPC_CHANNELS, AppStatus, TranscriptionResult } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isRecordingActive = false
let isBatchMode = false
let streamedText = ''
let recordingStartTime = 0

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
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => getSettings())
  ipcMain.handle(IPC_CHANNELS.SET_SETTINGS, (_event, settings) => {
    const updated = setSettings(settings)
    unregisterHotkey()
    setupHotkey()
    mainWindow?.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, updated)
    return updated
  })

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

  ipcMain.handle(IPC_CHANNELS.GET_HISTORY, () => getHistory())
  ipcMain.handle(IPC_CHANNELS.CLEAR_HISTORY, () => {
    clearHistory()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.GET_APP_STATUS, (): AppStatus => ({
    isRecording: isRecordingActive,
    isTranscribing: false,
    activeModel: getSettings().activeModel,
    modelsDownloaded: getDownloadedModels()
  }))

  ipcMain.handle(IPC_CHANNELS.START_RECORDING, () => handleStartRecording())
  ipcMain.handle(IPC_CHANNELS.STOP_RECORDING, () => handleStopRecording())

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

  if (!settings.activeModel) {
    showError('❌ No model selected. Please download and select a model in Settings.')
    resetRecordingState()
    return
  }

  if (!isModelDownloaded(settings.activeModel)) {
    showError(`❌ Model "${settings.activeModel}" is not downloaded. Please download it from Settings.`)
    resetRecordingState()
    return
  }

  isRecordingActive = true
  streamedText = ''
  recordingStartTime = Date.now()

  mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: true })

  // Use batch mode for heavy models (medium/large) — they can't keep up with real-time streaming on CPU
  const useBatch = isHeavyModel(settings.activeModel) || !isStreamBinaryAvailable()

  if (useBatch) {
    isBatchMode = true
    console.log(`[main] Using batch mode for model "${settings.activeModel}"`)

    if (!isCliBinaryAvailable()) {
      showError('❌ whisper-cli.exe not found in resources/whisper/.')
      resetRecordingState()
      isRecordingActive = false
      return
    }

    if (settings.overlayEnabled) {
      showOverlay('🎙️ Recording... (will transcribe after)')
    }

    startRecording({
      onStarted: () => {
        console.log('[main] Recording started (batch mode)')
      },
      onStopped: (filePath) => {
        console.log(`[main] Recording stopped, file: ${filePath}`)
        handleBatchTranscription(filePath)
      },
      onError: (error) => {
        console.error(`[main] Recording error: ${error}`)
        isRecordingActive = false
        isBatchMode = false
        hideOverlay()
        showError(`❌ Recording error: ${error}`)
        mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false })
        resetRecordingState()
      }
    })
  } else {
    isBatchMode = false
    console.log(`[main] Using streaming mode for model "${settings.activeModel}"`)

    if (settings.overlayEnabled) {
      showOverlay('🎙️ Listening...')
    }

    startStream({
      modelId: settings.activeModel,
      language: settings.language,
      onPartial: (fullTranscript) => {
        streamedText = fullTranscript
        if (settings.overlayEnabled) {
          updateOverlay(fullTranscript || '🎙️ Listening...')
        }
        mainWindow?.webContents.send(IPC_CHANNELS.TRANSCRIPTION_PARTIAL, fullTranscript)
      },
      onError: (error) => {
        isRecordingActive = false
        hideOverlay()
        showError(`❌ ${error}`)
        mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false })
        resetRecordingState()
      }
    })

    console.log('[main] Streaming transcription started')
  }
}

async function handleStopRecording(): Promise<void> {
  if (!isRecordingActive) return

  isRecordingActive = false
  mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false })

  if (isBatchMode) {
    // In batch mode, stopping the recording triggers the file save → transcription pipeline
    stopRecording()
    // Don't hide overlay yet — handleBatchTranscription will update it
  } else {
    // Streaming mode — get the full accumulated transcript
    const finalText = stopStream()
    hideOverlay()

    console.log(`[main] Streaming stopped. Text: "${finalText}"`)

    if (finalText) {
      await injectText(finalText)

      const result: TranscriptionResult = {
        text: finalText,
        timestamp: Date.now(),
        duration: Date.now() - recordingStartTime,
        model: getSettings().activeModel
      }
      addToHistory(result)
      mainWindow?.webContents.send(IPC_CHANNELS.TRANSCRIPTION_COMPLETE, result)
    }

    streamedText = ''
  }
}

function handleBatchTranscription(audioPath: string): void {
  const settings = getSettings()

  if (settings.overlayEnabled) {
    updateOverlay('⏳ Transcribing...')
  }

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
      isBatchMode = false
      hideOverlay()

      const finalText = text.trim()
      console.log(`[main] Batch transcription complete. Text: "${finalText}"`)

      if (finalText) {
        await injectText(finalText)

        const result: TranscriptionResult = {
          text: finalText,
          timestamp: Date.now(),
          duration: Date.now() - recordingStartTime,
          model: settings.activeModel
        }
        addToHistory(result)
        mainWindow?.webContents.send(IPC_CHANNELS.TRANSCRIPTION_COMPLETE, result)
      }

      mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false, isTranscribing: false })
    },
    onError: (error) => {
      isBatchMode = false
      hideOverlay()
      showError(`❌ Transcription error: ${error}`)
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

app.whenReady().then(() => {
  createMainWindow()
  createTray()
  createOverlayWindow()
  setupIPC()
  setupHotkey()

  console.log('[main] Local Whisper started')
})

app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  unregisterHotkey()
  stopStream()
  cancelTranscription()
  cleanupTempFiles()
  mainWindow?.destroy()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})
