import Store from 'electron-store'
import { AppSettings, DEFAULT_SETTINGS, TranscriptionResult } from '../shared/types'

interface StoreSchema {
  settings: AppSettings
  history: TranscriptionResult[]
}

const store = new Store<StoreSchema>({
  defaults: {
    settings: DEFAULT_SETTINGS,
    history: []
  }
})

export function getSettings(): AppSettings {
  return store.get('settings')
}

export function setSettings(settings: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const updated = { ...current, ...settings }
  store.set('settings', updated)
  return updated
}

export function getHistory(): TranscriptionResult[] {
  return store.get('history')
}

export function addToHistory(result: TranscriptionResult): void {
  const history = getHistory()
  history.unshift(result)
  // Keep last 100 entries
  if (history.length > 100) history.length = 100
  store.set('history', history)
}

export function clearHistory(): void {
  store.set('history', [])
}

export default store
