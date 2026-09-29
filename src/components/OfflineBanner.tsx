import { API_URL } from '../lib/api'

export function OfflineBanner({ onMock, onRetry }: { onMock: () => void; onRetry: () => void }) {
  return (
    <div className="banner" role="alert">
      <span className="flag" aria-hidden="true" />
      <p>
        <strong>API offline.</strong> No response from <code>{API_URL}/api/health</code>. Start the backend or run
        on scripted data.
      </p>
      <div className="banner__actions">
        <button type="button" className="btn btn--primary" onClick={onMock}>
          Use mock mode
        </button>
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  )
}
