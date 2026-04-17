import { useState, useEffect } from 'react'
import AppIcon from './AppIcon'

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.electronAPI.isWindowMaximized().then(setIsMaximized)
    const cleanup = window.electronAPI.onWindowMaximizedChange(setIsMaximized)
    return cleanup
  }, [])

  return (
    <div className="titlebar flex items-center justify-between pr-0">
      {/* Left: icon + title */}
      <div className="flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground select-none">
        <AppIcon className="h-4 w-4 shrink-0" />
        <span>Local Whisper</span>
      </div>

      {/* Right: window control buttons */}
      <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => window.electronAPI.minimizeWindow()}
          className="titlebar-btn hover:bg-muted"
          aria-label="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={() => window.electronAPI.maximizeWindow()}
          className="titlebar-btn hover:bg-muted"
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2" y="0" width="8" height="8" />
              <polyline points="0,2 0,10 8,10" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0" y="0" width="10" height="10" />
            </svg>
          )}
        </button>
        <button
          onClick={() => window.electronAPI.closeWindow()}
          className="titlebar-btn titlebar-btn-close hover:bg-destructive hover:text-white"
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  )
}
