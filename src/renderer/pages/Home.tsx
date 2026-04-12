import { useEffect, useState } from 'react'
import type { ElectronAPI } from '../../preload/index'
import type { TranscriptionResult, AppStatus } from '../../shared/types'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export default function Home() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [partialText, setPartialText] = useState('')
  const [history, setHistory] = useState<TranscriptionResult[]>([])

  useEffect(() => {
    // Load initial data
    window.electronAPI.getAppStatus().then(setStatus)
    window.electronAPI.getHistory().then(setHistory)

    // Subscribe to events
    const unsubs = [
      window.electronAPI.onRecordingStatus((s) => {
        setIsRecording(s.isRecording)
        setIsTranscribing(s.isTranscribing || false)
      }),
      window.electronAPI.onTranscriptionPartial((text) => {
        setPartialText(text)
      }),
      window.electronAPI.onTranscriptionComplete((result) => {
        setPartialText('')
        setHistory(prev => [result, ...prev])
      }),
      window.electronAPI.onTranscriptionError((error) => {
        console.error('Transcription error:', error)
        setPartialText('')
      })
    ]

    return () => unsubs.forEach(unsub => unsub())
  }, [])

  const handleToggleRecording = async () => {
    if (isRecording) {
      await window.electronAPI.stopRecording()
    } else {
      await window.electronAPI.startRecording()
    }
  }

  const handleClearHistory = async () => {
    await window.electronAPI.clearHistory()
    setHistory([])
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDuration = (ms: number) => {
    const seconds = Math.round(ms / 1000)
    return `${seconds}s`
  }

  return (
    <div>
      <h2 className="page-title">Home</h2>

      {/* Status card */}
      <div className="card">
        <div className="card-title">Status</div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span className={`badge ${status?.modelsDownloaded?.length ? 'badge-success' : 'badge-warning'}`}>
            {status?.modelsDownloaded?.length ? '● Ready' : '⚠ No models'}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Model: <strong>{status?.activeModel || 'None'}</strong>
          </span>
        </div>
      </div>

      {/* Recording control */}
      <div className="card">
        <div className="card-title">Recording</div>
        
        {isRecording && (
          <div className="recording-indicator">
            <div className="recording-dot" />
            <span style={{ fontSize: '14px', color: 'var(--danger)' }}>Recording...</span>
          </div>
        )}

        {isTranscribing && (
          <div className="recording-indicator" style={{ background: 'rgba(108, 92, 231, 0.1)' }}>
            <span style={{ fontSize: '14px', color: 'var(--accent)' }}>⏳ Transcribing...</span>
          </div>
        )}

        {partialText && (
          <div style={{
            padding: '12px',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '14px',
            lineHeight: '1.5',
            marginBottom: '12px',
            color: 'var(--text-secondary)',
            fontStyle: 'italic'
          }}>
            {partialText}
          </div>
        )}

        <button
          className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
          onClick={handleToggleRecording}
          disabled={isTranscribing}
        >
          {isRecording ? '⏹ Stop Recording' : '🎙️ Start Recording'}
        </button>
        <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          or use hotkey (Ctrl+Shift+Space)
        </span>
      </div>

      {/* History */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div className="card-title" style={{ margin: 0 }}>Transcription History</div>
          {history.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={handleClearHistory}>
              Clear
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No transcriptions yet. Use the hotkey or button to start recording.
          </div>
        ) : (
          history.map((item, i) => (
            <div key={i} className="history-item">
              <div className="history-text">{item.text}</div>
              <div className="history-meta">
                <span>{formatTime(item.timestamp)}</span>
                <span>⏱ {formatDuration(item.duration)}</span>
                <span>📦 {item.model}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
