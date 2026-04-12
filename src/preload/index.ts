import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, AppSettings, WhisperModel, TranscriptionResult, AppStatus } from '../shared/types'

const electronAPI = {
  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  setSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_SETTINGS, settings),
  onSettingsChanged: (callback: (settings: AppSettings) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, (_event, settings) => callback(settings))
    return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.SETTINGS_CHANGED)
  },

  // Models
  listModels: (): Promise<WhisperModel[]> => ipcRenderer.invoke(IPC_CHANNELS.LIST_MODELS),
  downloadModel: (modelId: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_MODEL, modelId),
  deleteModel: (modelId: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.DELETE_MODEL, modelId),
  getActiveModel: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.GET_ACTIVE_MODEL),
  setActiveModel: (modelId: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_ACTIVE_MODEL, modelId),
  onDownloadProgress: (callback: (data: { modelId: string; percent: number }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_PROGRESS, (_event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.DOWNLOAD_PROGRESS)
  },

  // Recording
  startRecording: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.START_RECORDING),
  stopRecording: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.STOP_RECORDING),
  onRecordingStatus: (callback: (status: { isRecording: boolean; isTranscribing?: boolean }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.RECORDING_STATUS, (_event, status) => callback(status))
    return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.RECORDING_STATUS)
  },

  // Transcription
  onTranscriptionPartial: (callback: (text: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION_PARTIAL, (_event, text) => callback(text))
    return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.TRANSCRIPTION_PARTIAL)
  },
  onTranscriptionComplete: (callback: (result: TranscriptionResult) => void) => {
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION_COMPLETE, (_event, result) => callback(result))
    return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.TRANSCRIPTION_COMPLETE)
  },
  onTranscriptionError: (callback: (error: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION_ERROR, (_event, error) => callback(error))
    return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.TRANSCRIPTION_ERROR)
  },

  // Error notifications
  onError: (callback: (error: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SHOW_ERROR, (_event, error) => callback(error))
    return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.SHOW_ERROR)
  },

  // Overlay
  onOverlayUpdate: (callback: (text: string) => void) => {
    ipcRenderer.on('overlay:update', (_event, text) => callback(text))
    return () => ipcRenderer.removeAllListeners('overlay:update')
  },

  // History
  getHistory: (): Promise<TranscriptionResult[]> => ipcRenderer.invoke(IPC_CHANNELS.GET_HISTORY),
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_HISTORY),

  // App
  getAppStatus: (): Promise<AppStatus> => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_STATUS),
  quitApp: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.QUIT_APP),
  showWindow: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.SHOW_WINDOW),

  // Audio capture helpers (used by recorder's hidden window)
  sendAudioData: (base64: string) => ipcRenderer.invoke('audio-data', base64),
  recordingStarted: () => ipcRenderer.invoke('recording-started'),
  recordingError: (error: string) => ipcRenderer.invoke('recording-error', error),
  onStopRecording: (callback: () => void) => {
    ipcRenderer.on('stop-recording', () => callback())
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
