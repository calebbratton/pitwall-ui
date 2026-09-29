import type { Connection } from '../hooks/useConnection'
import { API_URL } from '../lib/api'

const LABEL = {
  checking: 'CHECKING',
  online: 'API LIVE',
  mock: 'MOCK',
  offline: 'OFFLINE',
} as const

interface Props {
  connection: Connection
  onNewSession: () => void
  panelOpen: boolean
  onTogglePanel: () => void
}

export function TopBar({ connection, onNewSession, panelOpen, onTogglePanel }: Props) {
  const { state, forced } = connection
  const statusText =
    state === 'online'
      ? `Connected to ${API_URL}`
      : state === 'mock'
        ? 'Mock mode: scripted responses, no backend'
        : state === 'offline'
          ? `Cannot reach ${API_URL}`
          : 'Checking API health'
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="brand__name">
          PIT WALL <b>AI</b>
        </span>
        <span className="brand__sub">Strategy review</span>
      </div>

      <div className="topbar__right">
        <span className={`status status--${state}`} title={statusText}>
          <span className="status__light" aria-hidden="true" />
          <span className="status__text">{LABEL[state]}</span>
          <span className="sr-only">{statusText}</span>
        </span>
        {!forced && (
          <label className="switch" title="Use scripted mock responses instead of the backend">
            <input
              type="checkbox"
              checked={state === 'mock'}
              onChange={(e) => connection.setMock(e.target.checked)}
            />
            <span className="switch__track" aria-hidden="true" />
            <span className="switch__label">Mock</span>
          </label>
        )}
        <button type="button" className="btn" onClick={onNewSession}>
          New session
        </button>
        <button
          type="button"
          className="btn btn--panel"
          onClick={onTogglePanel}
          aria-expanded={panelOpen}
          aria-controls="session-panel"
        >
          Session
        </button>
      </div>
    </header>
  )
}
