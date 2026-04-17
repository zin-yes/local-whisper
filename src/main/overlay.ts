import { app, BrowserWindow, screen } from 'electron'
import * as path from 'path'
import { getWindowIcon } from './icon'
let overlayWindow: BrowserWindow | null = null
const isDev = !app.isPackaged

const OVERLAY_WIDTH = 600
const OVERLAY_HEIGHT = 160

function getOverlayPositionForCursor(): { x: number; y: number } {
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { x: dx, y: dy } = display.workArea
  const { width: dw, height: dh } = display.workAreaSize
  return {
    x: Math.round(dx + (dw - OVERLAY_WIDTH) / 2),
    y: dy + dh - OVERLAY_HEIGHT - 40
  }
}

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow
  }

  const { x, y } = getOverlayPositionForCursor()

  overlayWindow = new BrowserWindow({
    icon: getWindowIcon(),
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  overlayWindow.setIgnoreMouseEvents(true)

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay.html'))
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

export function showOverlay(text?: string): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow()
  }
  
  if (overlayWindow) {
    const { x, y } = getOverlayPositionForCursor()
    overlayWindow.setBounds({ x, y, width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT })
    if (text) {
      overlayWindow.webContents.send('overlay:update', text)
    }
    overlayWindow.showInactive()
  }
}

export function updateOverlay(text: string): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:update', text)
  }
}

export function hideOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}
