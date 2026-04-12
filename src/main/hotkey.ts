import { UiohookKey, uIOhook } from 'uiohook-napi'
import { getSettings, setSettings } from './store'
import { BrowserWindow } from 'electron'

type HotkeyCallback = (action: 'start' | 'stop') => void

let callback: HotkeyCallback | null = null
let isRecording = false
let pressedKeys = new Set<number>()

// Map from our string format to uiohook keycodes
const KEY_MAP: Record<string, number> = {
  'Ctrl': UiohookKey.Ctrl,
  'Shift': UiohookKey.Shift,
  'Alt': UiohookKey.Alt,
  'Space': UiohookKey.Space,
  'A': UiohookKey.A,
  'B': UiohookKey.B,
  'C': UiohookKey.C,
  'D': UiohookKey.D,
  'E': UiohookKey.E,
  'F': UiohookKey.F,
  'G': UiohookKey.G,
  'H': UiohookKey.H,
  'I': UiohookKey.I,
  'J': UiohookKey.J,
  'K': UiohookKey.K,
  'L': UiohookKey.L,
  'M': UiohookKey.M,
  'N': UiohookKey.N,
  'O': UiohookKey.O,
  'P': UiohookKey.P,
  'Q': UiohookKey.Q,
  'R': UiohookKey.R,
  'S': UiohookKey.S,
  'T': UiohookKey.T,
  'U': UiohookKey.U,
  'V': UiohookKey.V,
  'W': UiohookKey.W,
  'X': UiohookKey.X,
  'Y': UiohookKey.Y,
  'Z': UiohookKey.Z
}

function parseHotkey(hotkeyStr: string): number[] {
  return hotkeyStr.split('+').map(key => {
    const mapped = KEY_MAP[key.trim()]
    if (mapped === undefined) {
      console.warn(`[hotkey] Unknown key: ${key}`)
      return -1
    }
    return mapped
  }).filter(k => k !== -1)
}

function areAllKeysPressed(requiredKeys: number[]): boolean {
  return requiredKeys.every(key => pressedKeys.has(key))
}

export function registerHotkey(cb: HotkeyCallback): void {
  callback = cb
  const settings = getSettings()
  const requiredKeys = parseHotkey(settings.hotkey)

  uIOhook.on('keydown', (e) => {
    pressedKeys.add(e.keycode)

    if (areAllKeysPressed(requiredKeys)) {
      if (settings.recordingMode === 'toggle') {
        if (!isRecording) {
          isRecording = true
          callback?.('start')
        } else {
          isRecording = false
          callback?.('stop')
        }
      } else {
        // Push-to-talk: start on press
        if (!isRecording) {
          isRecording = true
          callback?.('start')
        }
      }
    }
  })

  uIOhook.on('keyup', (e) => {
    pressedKeys.delete(e.keycode)

    // Push-to-talk: stop when any hotkey key is released
    if (settings.recordingMode === 'push-to-talk' && isRecording) {
      const releasedKeyIsPartOfHotkey = requiredKeys.includes(e.keycode)
      if (releasedKeyIsPartOfHotkey) {
        isRecording = false
        callback?.('stop')
      }
    }
  })

  uIOhook.start()
  console.log(`[hotkey] Registered hotkey: ${settings.hotkey} (mode: ${settings.recordingMode})`)
}

export function unregisterHotkey(): void {
  uIOhook.stop()
  callback = null
  pressedKeys.clear()
  isRecording = false
}

export function resetRecordingState(): void {
  isRecording = false
  pressedKeys.clear()
}
