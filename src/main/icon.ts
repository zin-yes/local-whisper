import { app, nativeImage, type NativeImage } from 'electron'
import * as path from 'path'

export const APP_ID = 'com.localwhisper.app'
export const APP_NAME = 'Local Whisper'

function getIconPath(filename: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icons', filename)
  }
  // In dev, __dirname is out/main/, so go up two levels to repo root
  return path.join(__dirname, '../../build', filename)
}

let windowIcon: NativeImage | null = null
let trayIcon: NativeImage | null = null

export function configureAppIdentity(): void {
  app.setAppUserModelId(APP_ID)
  app.setName(APP_NAME)
}

export function getWindowIcon(): NativeImage {
  if (!windowIcon) {
    windowIcon = nativeImage.createFromPath(getIconPath('icon.ico'))
  }
  return windowIcon
}

export function getTrayIcon(): NativeImage {
  if (!trayIcon) {
    // Load the ICO (contains 16x16 through 256x256) and resize to 16px for the tray
    const ico = nativeImage.createFromPath(getIconPath('icon.ico'))
    trayIcon = ico.resize({ width: 16, height: 16, quality: 'best' })
  }
  return trayIcon
}
