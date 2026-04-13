import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download, Trash2, Check, Loader2, Keyboard, MonitorCog,
  Globe, Eye, ChevronDown
} from 'lucide-react'
import type { AppSettings, WhisperModel } from '../../shared/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Switch } from '../components/ui/switch'
import { Progress } from '../components/ui/progress'

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

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold tracking-tight">Settings</h2>

      {/* Models */}
      <Card>
        <CardHeader>
          <CardTitle>Whisper Models</CardTitle>
          <CardDescription>
            Download a model to get started. Larger models are more accurate but slower.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {models.map((model) => (
              <motion.div
                key={model.id}
                layout
                className="flex items-center justify-between py-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{model.name}</span>
                    {settings.activeModel === model.id && (
                      <Badge variant="success">
                        <Check className="h-3 w-3" /> Active
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{model.size}</div>
                  <AnimatePresence>
                    {downloading.has(model.id) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pt-1.5 w-48 space-y-1 overflow-hidden"
                      >
                        <Progress value={downloadProgress[model.id] || 0} />
                        <span className="text-[11px] text-muted-foreground">
                          {downloadProgress[model.id] || 0}%
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="flex items-center gap-2">
                  {model.downloaded ? (
                    <>
                      {settings.activeModel !== model.id && (
                        <Button size="sm" onClick={() => handleSetActiveModel(model.id)}>
                          Use
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteModel(model.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleDownloadModel(model.id)}
                      disabled={downloading.has(model.id)}
                    >
                      {downloading.has(model.id) ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Downloading</>
                      ) : (
                        <><Download className="h-3.5 w-3.5" /> Download</>
                      )}
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Hotkey */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Hotkey</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Global Shortcut</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Press this key combination anywhere to start/stop recording
              </div>
            </div>
            <kbd className="inline-flex items-center rounded-md border border-border bg-muted px-3 py-1.5 font-mono text-xs font-semibold">
              {settings.hotkey}
            </kbd>
          </div>
        </CardContent>
      </Card>

      {/* Recording Mode */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MonitorCog className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Recording Mode</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Mode</div>
              <div className="text-xs text-muted-foreground mt-0.5 max-w-xs">
                Toggle: press once to start, again to stop. Push-to-talk: hold to record, release to stop.
              </div>
            </div>
            <div className="relative">
              <select
                className="appearance-none bg-muted border border-border rounded-md px-3 py-1.5 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                value={settings.recordingMode}
                onChange={(e) => updateSetting('recordingMode', e.target.value as 'toggle' | 'push-to-talk')}
              >
                <option value="toggle">Toggle</option>
                <option value="push-to-talk">Push to Talk</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Language</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Transcription Language</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Set to auto for automatic language detection
              </div>
            </div>
            <div className="relative">
              <select
                className="appearance-none bg-muted border border-border rounded-md px-3 py-1.5 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring cursor-pointer"
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
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overlay */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Overlay</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Show Transcription Overlay</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Display real-time transcription text at the bottom of the screen
              </div>
            </div>
            <Switch
              checked={settings.overlayEnabled}
              onCheckedChange={(checked) => updateSetting('overlayEnabled', checked)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
