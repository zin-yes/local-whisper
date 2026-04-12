import { useEffect, useState } from 'react'

declare global {
  interface Window {
    electronAPI: {
      onOverlayUpdate: (callback: (text: string) => void) => () => void
    }
  }
}

export default function Overlay() {
  const [text, setText] = useState('🎙️ Listening...')
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const unsubscribe = window.electronAPI.onOverlayUpdate((newText) => {
      setText(newText)
      setVisible(true)
    })
    return unsubscribe
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
      <div style={{
        background: 'rgba(20, 20, 40, 0.92)',
        borderRadius: '16px',
        padding: '14px 28px',
        color: '#fff',
        fontSize: '15px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontWeight: 400,
        letterSpacing: '0.2px',
        maxWidth: '100%',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px)',
        animation: 'fadeIn 0.2s ease-out',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}>
        {text}
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
