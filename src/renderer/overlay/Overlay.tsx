import { useEffect, useState, useRef } from 'react'

declare global {
  interface Window {
    electronAPI: {
      onOverlayUpdate: (callback: (text: string) => void) => () => void
    }
  }
}

const DEFAULT_TEXT = 'Listening...'

export default function Overlay() {
  const [displayedText, setDisplayedText] = useState(DEFAULT_TEXT)
  const [visible, setVisible] = useState(true)
  const targetTextRef = useRef(DEFAULT_TEXT)
  const animFrameRef = useRef<number | null>(null)
  const displayedRef = useRef(DEFAULT_TEXT)

  useEffect(() => {
    const unsubscribe = window.electronAPI.onOverlayUpdate((newText) => {
      setVisible(true)
      targetTextRef.current = newText

      if (!animFrameRef.current) {
        streamIn()
      }
    })
    return unsubscribe
  }, [])

  function streamIn() {
    const target = targetTextRef.current
    const current = displayedRef.current

    if (current === target) {
      animFrameRef.current = null
      return
    }

    if (!target.startsWith(current.slice(0, Math.min(current.length, target.length)))) {
      displayedRef.current = target
      setDisplayedText(target)
      animFrameRef.current = null
      return
    }

    const charsToAdd = Math.min(3, target.length - current.length)
    if (charsToAdd > 0) {
      const next = target.slice(0, current.length + charsToAdd)
      displayedRef.current = next
      setDisplayedText(next)
    } else {
      displayedRef.current = target
      setDisplayedText(target)
    }

    animFrameRef.current = window.setTimeout(streamIn, 18) as unknown as number
  }

  useEffect(() => {
    return () => {
      if (animFrameRef.current) clearTimeout(animFrameRef.current)
    }
  }, [])

  if (!visible) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      padding: '8px 16px'
    }}>
      <div className="overlay-pill">
        <span className="overlay-text">{displayedText}</span>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .overlay-pill {
          background: rgba(0, 0, 0, 0.88);
          border-radius: 16px;
          padding: 14px 28px;
          font-size: 15px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-weight: 400;
          letter-spacing: 0.2px;
          max-width: 100%;
          text-align: center;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          animation: fadeIn 0.2s ease-out;
          overflow: hidden;
          word-break: break-word;
          white-space: normal;
        }
        .overlay-text {
          color: rgba(255, 255, 255, 0.9);
        }
        @media (prefers-color-scheme: light) {
          .overlay-pill {
            background: rgba(255, 255, 255, 0.92);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.08);
          }
          .overlay-text {
            color: rgba(0, 0, 0, 0.85);
          }
        }
      `}</style>
    </div>
  )
}
