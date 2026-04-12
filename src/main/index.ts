import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getSettings, setSettings, getHistory, addToHistory, clearHistory } from './store'
import { registerHotkey, unregisterHotkey, resetRecordingState } from './hotkey'
import { startStream, stopStream, isStreamBinaryAvailable, isCliBinaryAvailable, isModelDownloaded, getDownloadedModels, cancelTranscription } from './whisper'
import { listModels, downloadModel, deleteModel } from './models'
import { createOverlayWindow, showOverlay, updateOverlay, hideOverlay } from './overlay'
import { injectText } from './injector'
import { IPC_CHANNELS, AppStatus, TranscriptionResult } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isRecordingActive = false
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

  if (!isStreamBinaryAvailable()) {
    showError('❌ whisper-stream.exe not found in resources/whisper/. Please check your installation.')
    resetRecordingState()
    return
  }

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

  if (settings.overlayEnabled) {
    showOverlay('🎙️ Listening...')
  }

  startStream({
    modelId: settings.activeModel,
    language: settings.language,
    onPartial: (text) => {
      streamedText = text
      if (settings.overlayEnabled) {
        updateOverlay(streamedText)
      }
      mainWindow?.webContents.send(IPC_CHANNELS.TRANSCRIPTION_PARTIAL, streamedText)
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

async function handleStopRecording(): Promise<void> {
  if (!isRecordingActive) return

  isRecordingActive = false
  stopStream()
  hideOverlay()

  mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false })

  const finalText = streamedText.trim()
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
  mainWindow?.destroy()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})
