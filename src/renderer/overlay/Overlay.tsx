import { useEffect, useState, useRef } from 'react'

declare global {
  interface Window {
    electronAPI: {
      onOverlayUpdate: (callback: (text: string) => void) => () => void
    }
  }
}

export default function Overlay() {
  const [displayedText, setDisplayedText] = useState('🎙️ Listening...')
  const [visible, setVisible] = useState(true)
  const targetTextRef = useRef('🎙️ Listening...')
  const animFrameRef = useRef<number | null>(null)
  const displayedRef = useRef('🎙️ Listening...')

  useEffect(() => {
    const unsubscribe = window.electronAPI.onOverlayUpdate((newText) => {
      setVisible(true)
      targetTextRef.current = newText

      // If no animation loop is running, start one
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

    // If target is shorter or completely different, snap to it
    if (!target.startsWith(current.slice(0, Math.min(current.length, target.length)))) {
      displayedRef.current = target
      setDisplayedText(target)
      animFrameRef.current = null
      return
    }

    // Reveal characters progressively (stream-in effect)
    const charsToAdd = Math.min(3, target.length - current.length)
    if (charsToAdd > 0) {
      const next = target.slice(0, current.length + charsToAdd)
      displayedRef.current = next
      setDisplayedText(next)
    } else {
      // Target shrunk or changed — snap
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
        <span className="shimmer-text">{displayedText}</span>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .overlay-pill {
          background: rgba(20, 20, 40, 0.92);
          border-radius: 16px;
          padding: 14px 28px;
          font-size: 15px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-weight: 400;
          letter-spacing: 0.2px;
          max-width: 100%;
          text-align: center;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px);
          animation: fadeIn 0.2s ease-out;
          overflow: hidden;
          word-break: break-word;
          white-space: normal;
        }
        .shimmer-text {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.85) 0%,
            rgba(255, 255, 255, 0.85) 35%,
            rgba(180, 200, 255, 1) 50%,
            rgba(255, 255, 255, 0.85) 65%,
            rgba(255, 255, 255, 0.85) 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 2.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
