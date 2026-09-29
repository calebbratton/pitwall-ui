import { useCallback, useState } from 'react'
import { CiteContext } from './components/cite-context'
import { Composer } from './components/Composer'
import { OfflineBanner } from './components/OfflineBanner'
import { SessionPanel } from './components/SessionPanel'
import { LiveView } from './components/LiveView'
import type { ViewMode } from './components/TopBar'
import { TopBar } from './components/TopBar'
import { Transcript } from './components/Transcript'
import { useChat } from './hooks/useChat'
import { useConnection } from './hooks/useConnection'

export default function App() {
  const connection = useConnection()
  const chat = useChat(connection.state === 'mock', connection.markOffline)
  const [panelOpen, setPanelOpen] = useState(false)
  const [mode, setMode] = useState<ViewMode>('chat')
  // LIVE mounts on first visit and then stays mounted, so a running replay survives a trip to the chat.
  const [liveMounted, setLiveMounted] = useState(false)
  const switchMode = useCallback((m: ViewMode) => {
    setMode(m)
    if (m === 'live') {
      setLiveMounted(true)
      setPanelOpen(false)
    }
  }, [])
  const mock = connection.state === 'mock'
  const [focusArticle, setFocusArticle] = useState<{ article: string; nonce: number } | null>(null)

  const onCite = useCallback((article: string) => {
    setPanelOpen(true)
    setFocusArticle((f) => ({ article, nonce: (f?.nonce ?? 0) + 1 }))
  }, [])
  const closePanel = useCallback(() => setPanelOpen(false), [])

  return (
    <CiteContext.Provider value={onCite}>
      <div className="app">
        {mode === 'chat' && (
          <a href="#composer-input" className="skip">
            Skip to message input
          </a>
        )}
        <TopBar
          mode={mode}
          onMode={switchMode}
          connection={connection}
          onNewSession={chat.reset}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((o) => !o)}
        />
        {connection.state === 'offline' && (
          <OfflineBanner onMock={() => connection.setMock(true)} onRetry={connection.recheck} />
        )}
        {liveMounted && (
          // Remount on mock/API switch so the old stream is closed and state reset.
          <LiveView key={mock ? 'mock' : 'api'} useMock={mock} hidden={mode !== 'live'} />
        )}
        <main className="layout" hidden={mode !== 'chat'}>
          <div className="main">
            <Transcript messages={chat.messages} onSuggest={chat.send} disabled={chat.streaming} />
            <Composer onSend={chat.send} streaming={chat.streaming} threadId={chat.threadId} />
          </div>
          <SessionPanel session={chat.session} open={panelOpen} onClose={closePanel} focusArticle={focusArticle} />
          {panelOpen && <div className="scrim" onClick={closePanel} aria-hidden="true" />}
        </main>
      </div>
    </CiteContext.Provider>
  )
}
