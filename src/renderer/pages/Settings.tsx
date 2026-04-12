import { useEffect, useState } from 'react'
import type { AppSettings, WhisperModel } from '../../shared/types'

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [models, setModels] = useState<WhisperModel[]>([])
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})
  const [downloading, setDownloading] = useState<Set<string>>(new Set())

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings)
    window.electronAPI.listModels().then(setModels)

    const unsub = window.electronAPI.onDownloadProgress((data) => {
      setDownloadProgress(prev => ({ ...prev, [data.modelId]: data.percent }))
    })

    return unsub
  }, [])

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (!settings) return
    const updated = await window.electronAPI.setSettings({ [key]: value })
    setSettings(updated)
  }

  const handleDownloadModel = async (modelId: string) => {
    setDownloading(prev => new Set([...prev, modelId]))
    setDownloadProgress(prev => ({ ...prev, [modelId]: 0 }))

    const result = await window.electronAPI.downloadModel(modelId)
    
    setDownloading(prev => {
      const next = new Set(prev)
      next.delete(modelId)
      return next
    })

    if (result.success) {
      // Refresh model list
      const updated = await window.electronAPI.listModels()
      setModels(updated)
      setDownloadProgress(prev => {
        const next = { ...prev }
        delete next[modelId]
        return next
      })
    } else {
      alert(`Download failed: ${result.error}`)
    }
  }

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm(`Delete the ${modelId} model?`)) return
    await window.electronAPI.deleteModel(modelId)
    const updated = await window.electronAPI.listModels()
    setModels(updated)
  }

  const handleSetActiveModel = async (modelId: string) => {
    await window.electronAPI.setActiveModel(modelId)
    updateSetting('activeModel', modelId)
  }

  if (!settings) return <div>Loading...</div>

  return (
    <div>
      <h2 className="page-title">Settings</h2>

      {/* Models */}
      <div className="card">
        <div className="card-title">Whisper Models</div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Download a model to get started. Larger models are more accurate but slower.
        </p>

        {models.map((model) => (
          <div key={model.id} className="model-item">
            <div className="model-info">
              <div className="model-name">
                {model.name}
                {settings.activeModel === model.id && (
                  <span className="badge badge-success" style={{ marginLeft: '8px' }}>Active</span>
                )}
              </div>
              <div className="model-size">{model.size}</div>
              {downloading.has(model.id) && (
                <div style={{ marginTop: '6px', width: '200px' }}>
                  <div className="progress">
                    <div className="progress-bar" style={{ width: `${downloadProgress[model.id] || 0}%` }} />
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {downloadProgress[model.id] || 0}%
                  </span>
                </div>
              )}
            </div>
            <div className="model-actions">
              {model.downloaded ? (
                <>
                  {settings.activeModel !== model.id && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleSetActiveModel(model.id)}>
                      Use
                    </button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteModel(model.id)}>
                    Delete
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleDownloadModel(model.id)}
                  disabled={downloading.has(model.id)}
                >
                  {downloading.has(model.id) ? 'Downloading...' : 'Download'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Hotkey */}
      <div className="card">
        <div className="card-title">Hotkey</div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Global Shortcut</div>
            <div className="setting-description">Press this key combination anywhere to start/stop recording</div>
          </div>
          <div style={{
            padding: '6px 14px',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'monospace',
            color: 'var(--accent)'
          }}>
            {settings.hotkey}
          </div>
        </div>
      </div>

      {/* Recording Mode */}
      <div className="card">
        <div className="card-title">Recording Mode</div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Mode</div>
            <div className="setting-description">
              Toggle: press once to start, again to stop. Push-to-talk: hold to record, release to stop.
            </div>
          </div>
          <select
            className="select"
            value={settings.recordingMode}
            onChange={(e) => updateSetting('recordingMode', e.target.value as 'toggle' | 'push-to-talk')}
          >
            <option value="toggle">Toggle</option>
            <option value="push-to-talk">Push to Talk</option>
          </select>
        </div>
      </div>

      {/* Language */}
      <div className="card">
        <div className="card-title">Language</div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Transcription Language</div>
            <div className="setting-description">Set to auto for automatic language detection</div>
          </div>
          <select
            className="select"
            value={settings.language}
            onChange={(e) => updateSetting('language', e.target.value)}
          >
            <option value="auto">Auto Detect</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="nl">Dutch</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
            <option value="ru">Russian</option>
            <option value="ar">Arabic</option>
            <option value="hi">Hindi</option>
          </select>
        </div>
      </div>

      {/* Overlay */}
      <div className="card">
        <div className="card-title">Overlay</div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Show Transcription Overlay</div>
            <div className="setting-description">Display real-time transcription text at the bottom of the screen</div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.overlayEnabled}
              onChange={(e) => updateSetting('overlayEnabled', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>
    </div>
  )
}
