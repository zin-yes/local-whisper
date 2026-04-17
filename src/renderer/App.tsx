import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Settings } from 'lucide-react'
import { cn } from './lib/utils'
import AppIcon from './components/AppIcon'
import Home from './pages/Home'
import SettingsPage from './pages/Settings'

type Page = 'home' | 'settings'

const navItems: { id: Page; label: string; icon: typeof Mic }[] = [
  { id: 'home', label: 'Home', icon: Mic },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function useSystemTheme() {
  const [dark, setDark] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return dark
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const isDark = useSystemTheme()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="titlebar flex items-center px-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <AppIcon className="h-4 w-4 shrink-0" />
          <span>Local Whisper</span>
        </div>
      </div>
      <div className="flex h-screen pt-9">
        {/* Sidebar */}
        <nav className="w-52 shrink-0 border-r border-border bg-card flex flex-col">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <AppIcon className="h-5 w-5 shrink-0" />
              <h1 className="text-sm font-semibold tracking-tight">Local Whisper</h1>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 p-2 mt-1">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setCurrentPage(id)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                  'hover:bg-muted',
                  currentPage === id
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="p-8"
            >
              {currentPage === 'home' && <Home />}
              {currentPage === 'settings' && <SettingsPage />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
