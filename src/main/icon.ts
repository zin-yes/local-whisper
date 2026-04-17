import { app, nativeImage, type NativeImage } from 'electron'

export const APP_ID = 'com.localwhisper.app'
export const APP_NAME = 'Local Whisper'

const APP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="100" ry="100" fill="url(#bg)"/>
  <g transform="translate(128,96) scale(10.67)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="2" width="6" height="11" rx="3"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </g>
</svg>`

let appIcon: NativeImage | null = null

function getBaseIcon(): NativeImage {
  if (!appIcon) {
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(APP_ICON_SVG).toString('base64')}`
    appIcon = nativeImage.createFromDataURL(dataUrl)
  }

  return appIcon
}

export function configureAppIdentity(): void {
  app.setAppUserModelId(APP_ID)
  app.setName(APP_NAME)
}

export function getWindowIcon(): NativeImage {
  return getBaseIcon()
}

export function getTrayIcon(): NativeImage {
  return getBaseIcon().resize({ width: 16, height: 16, quality: 'best' })
}
