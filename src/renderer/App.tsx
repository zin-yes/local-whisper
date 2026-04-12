import { useState } from 'react'
import Home from './pages/Home'
import Settings from './pages/Settings'

type Page = 'home' | 'settings'

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home')

  return (
    <>
      <div className="titlebar" />
      <div className="app-container">
        <nav className="sidebar">
          <div className="sidebar-header">
            <h1>🎙️ Local Whisper</h1>
          </div>
          <button
            className={`nav-item ${currentPage === 'home' ? 'active' : ''}`}
            onClick={() => setCurrentPage('home')}
          >
            <span className="icon">🏠</span>
            Home
          </button>
          <button
            className={`nav-item ${currentPage === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentPage('settings')}
          >
            <span className="icon">⚙️</span>
            Settings
          </button>
        </nav>
        <main className="content">
          {currentPage === 'home' && <Home />}
          {currentPage === 'settings' && <Settings />}
        </main>
      </div>
    </>
  )
}
