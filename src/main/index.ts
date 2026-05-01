import { app, BrowserWindow, ipcMain, Tray, Menu } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getSettings, setSettings, getHistory, addToHistory, clearHistory } from './store'
import { registerHotkey, unregisterHotkey, resetRecordingState } from './hotkey'
import {
  startStream, stopStream, transcribe,
  isStreamBinaryAvailable, isCliBinaryAvailable,
  isModelDownloaded, getDownloadedModels, cancelTranscription, getLiveModelId
} from './whisper'
import { startRecording, stopRecording, cleanupTempFiles } from './recorder'
import { listModels, downloadModel, deleteModel } from './models'
import { createOverlayWindow, showOverlay, updateOverlay, hideOverlay } from './overlay'
import { injectText } from './injector'
import { APP_NAME, configureAppIdentity, getTrayIcon, getWindowIcon } from './icon'
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
    title: APP_NAME,
    icon: getWindowIcon(),
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    backgroundColor: '#ffffff',
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

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGE, true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGE, false)
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
  tray = new Tray(getTrayIcon())

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Show ${APP_NAME}`,
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

  tray.setToolTip(APP_NAME)
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
  ipcMain.handle(IPC_CHANNELS.SET_SETTINGS, async (_event, settings) => {
    // Stop any active recording/stream before applying new settings
    if (isRecordingActive) {
      await handleStopRecording()
    }
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

  ipcMain.handle(IPC_CHANNELS.TRANSCRIBE_FILE, async (_event, audioData: Buffer) => {
    if (isRecordingActive || isBatchMode) {
      showError('Cannot transcribe a file while recording is active.')
      return
    }

    const settings = getSettings()

    if (!settings.activeModel) {
      showError('No model selected. Please download and select a model in Settings.')
      return
    }

    if (!isModelDownloaded(settings.activeModel)) {
      showError(`Model "${settings.activeModel}" is not downloaded. Please download it from Settings.`)
      return
    }

    if (!isCliBinaryAvailable()) {
      showError('whisper-cli.exe not found in resources/whisper/.')
      return
    }

    const tempFilePath = path.join(app.getPath('temp'), `whisper-file-${Date.now()}.wav`)
    fs.writeFileSync(tempFilePath, audioData)

    isBatchMode = true
    const fileTranscriptionStartTime = Date.now()
    mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false, isTranscribing: true })

    await new Promise<void>((resolve) => {
      transcribe({
        audioPath: tempFilePath,
        modelId: settings.activeModel,
        language: settings.language,
        onPartial: (text) => {
          mainWindow?.webContents.send(IPC_CHANNELS.TRANSCRIPTION_PARTIAL, text)
        },
        onComplete: (text) => {
          isBatchMode = false
          try { fs.unlinkSync(tempFilePath) } catch { /* ignore cleanup errors */ }

          const finalText = text.trim()
          if (finalText) {
            const result: TranscriptionResult = {
              text: finalText,
              timestamp: Date.now(),
              duration: Date.now() - fileTranscriptionStartTime,
              model: settings.activeModel
            }
            addToHistory(result)
            mainWindow?.webContents.send(IPC_CHANNELS.TRANSCRIPTION_COMPLETE, result)
          }

          mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false, isTranscribing: false })
          resolve()
        },
        onError: (error) => {
          isBatchMode = false
          try { fs.unlinkSync(tempFilePath) } catch { /* ignore cleanup errors */ }
          showError(`File transcription error: ${error}`)
          mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false, isTranscribing: false })
          resolve()
        }
      })
    })
  })

  ipcMain.handle(IPC_CHANNELS.QUIT_APP, () => {
    mainWindow?.destroy()
    app.quit()
  })
  ipcMain.handle(IPC_CHANNELS.SHOW_WINDOW, () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => mainWindow?.minimize())
  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => mainWindow?.hide())
  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => mainWindow?.isMaximized() ?? false)
}

function handleStartRecording(): void {
  const settings = getSettings()

  if (!settings.activeModel) {
    showError('No model selected. Please download and select a model in Settings.')
    resetRecordingState()
    return
  }

  if (!isModelDownloaded(settings.activeModel)) {
    showError(`Model "${settings.activeModel}" is not downloaded. Please download it from Settings.`)
    resetRecordingState()
    return
  }

  isRecordingActive = true
  streamedText = ''
  recordingStartTime = Date.now()

  mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: true })

  // Always use hybrid mode: live stream with tiny for preview + record audio for final batch pass
  const liveModelId = getLiveModelId()
  const canStream = liveModelId && isStreamBinaryAvailable()
  const canBatch = isCliBinaryAvailable()

  if (!canBatch) {
    showError('whisper-cli.exe not found in resources/whisper/.')
    resetRecordingState()
    isRecordingActive = false
    return
  }

  isBatchMode = true

  if (canStream) {
    console.log(`[main] Using hybrid mode: live stream with "${liveModelId}", final pass with "${settings.activeModel}"`)

    if (settings.overlayEnabled) {
      showOverlay('Listening...')
    }

    // Start live streaming with tiny model for real-time preview
    startStream({
      modelId: liveModelId,
      language: settings.language,
      onPartial: (fullTranscript) => {
        streamedText = fullTranscript
        if (settings.overlayEnabled) {
          updateOverlay(fullTranscript || 'Listening...')
        }
        mainWindow?.webContents.send(IPC_CHANNELS.TRANSCRIPTION_PARTIAL, fullTranscript)
      },
      onError: (error) => {
        console.error(`[main] Live stream error: ${error}`)
      }
    })
  } else {
    console.log(`[main] No tiny model for live preview, recording only. Final pass with "${settings.activeModel}"`)
    if (settings.overlayEnabled) {
      showOverlay('Recording... (will transcribe after)')
    }
  }

  // Always record audio for the final batch transcription with the selected model
  startRecording({
    onStarted: () => {
      console.log('[main] Recording started')
    },
    onStopped: (filePath) => {
      console.log(`[main] Recording stopped, file: ${filePath}`)
      handleBatchTranscription(filePath)
    },
    onError: (error) => {
      console.error(`[main] Recording error: ${error}`)
      isRecordingActive = false
      isBatchMode = false
      stopStream()
      hideOverlay()
      showError(`Recording error: ${error}`)
      mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false })
      resetRecordingState()
    }
  })
}

async function handleStopRecording(): Promise<void> {
  if (!isRecordingActive) return

  isRecordingActive = false
  mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STATUS, { isRecording: false })

  // Stop live stream preview
  stopStream()
  // Stop recording — triggers file save → batch transcription pipeline
  stopRecording()
  if (getSettings().overlayEnabled) {
    updateOverlay('Transcribing...')
  }
  streamedText = ''
}

function handleBatchTranscription(audioPath: string): void {
  const settings = getSettings()

  if (settings.overlayEnabled) {
    updateOverlay('Transcribing...')
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
      showError(`Transcription error: ${error}`)
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
  configureAppIdentity()
  createMainWindow()
  createTray()
  createOverlayWindow()
  setupIPC()
  setupHotkey()

  console.log(`[main] ${APP_NAME} started`)
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
