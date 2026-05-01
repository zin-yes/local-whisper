export const IPC_CHANNELS = {
  // Recording
  START_RECORDING: 'recording:start',
  STOP_RECORDING: 'recording:stop',
  RECORDING_STATUS: 'recording:status',

  // Transcription
  TRANSCRIPTION_PARTIAL: 'transcription:partial',
  TRANSCRIPTION_COMPLETE: 'transcription:complete',
  TRANSCRIPTION_ERROR: 'transcription:error',

  // Error notifications
  SHOW_ERROR: 'error:show',

  // Overlay
  OVERLAY_SHOW: 'overlay:show',
  OVERLAY_HIDE: 'overlay:hide',
  OVERLAY_UPDATE: 'overlay:update',

  // Settings
  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set',
  SETTINGS_CHANGED: 'settings:changed',

  // Models
  LIST_MODELS: 'models:list',
  DOWNLOAD_MODEL: 'models:download',
  DOWNLOAD_PROGRESS: 'models:download-progress',
  DELETE_MODEL: 'models:delete',
  GET_ACTIVE_MODEL: 'models:get-active',
  SET_ACTIVE_MODEL: 'models:set-active',

  // File transcription
  TRANSCRIBE_FILE: 'transcribe:file',

  // History
  GET_HISTORY: 'history:get',
  CLEAR_HISTORY: 'history:clear',

  // App
  GET_APP_STATUS: 'app:status',
  QUIT_APP: 'app:quit',
  SHOW_WINDOW: 'app:show-window',

  // Window controls
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_MAXIMIZED_CHANGE: 'window:maximized-change'
} as const

export interface WhisperModel {
  id: string
  name: string
  size: string
  url: string
  downloaded: boolean
  filePath?: string
}

export interface AppSettings {
  hotkey: string
  recordingMode: 'push-to-talk' | 'toggle'
  activeModel: string
  language: string
  audioDevice: string
  overlayEnabled: boolean
  autoStart: boolean
}

export interface TranscriptionResult {
  text: string
  timestamp: number
  duration: number
  model: string
}

export interface AppStatus {
  isRecording: boolean
  isTranscribing: boolean
  activeModel: string | null
  modelsDownloaded: string[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: 'Ctrl+Shift+Space',
  recordingMode: 'toggle',
  activeModel: 'base',
  language: 'auto',
  audioDevice: 'default',
  overlayEnabled: true,
  autoStart: false
}

export const WHISPER_MODELS: Omit<WhisperModel, 'downloaded' | 'filePath'>[] = [
  {
    id: 'tiny',
    name: 'Tiny',
    size: '75 MB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin'
  },
  {
    id: 'base',
    name: 'Base',
    size: '142 MB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
  },
  {
    id: 'small',
    name: 'Small',
    size: '466 MB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
  },
  {
    id: 'medium',
    name: 'Medium',
    size: '1.5 GB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin'
  },
  {
    id: 'large',
    name: 'Large',
    size: '2.9 GB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
  }
]
