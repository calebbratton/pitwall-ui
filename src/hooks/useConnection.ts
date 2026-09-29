import { useCallback, useEffect, useState } from 'react'
import { checkHealth, MOCK_FORCED } from '../lib/api'
import type { ConnectionState } from '../types'

export interface Connection {
  state: ConnectionState
  /** true when mock was forced via VITE_MOCK and cannot be turned off */
  forced: boolean
  /** API reachable on the last health check */
  apiUp: boolean | null
  setMock: (on: boolean) => void
  recheck: () => void
  markOffline: () => void
}

export function useConnection(): Connection {
  const [mock, setMockState] = useState<boolean>(MOCK_FORCED)
  const [apiUp, setApiUp] = useState<boolean | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (MOCK_FORCED) return
    let cancelled = false
    checkHealth().then((ok) => {
      if (!cancelled) setApiUp(ok)
    })
    return () => {
      cancelled = true
    }
  }, [nonce])

  const recheck = useCallback(() => {
    setApiUp(null)
    setNonce((n) => n + 1)
  }, [])
  const setMock = useCallback((on: boolean) => {
    if (!MOCK_FORCED) setMockState(on)
  }, [])
  const markOffline = useCallback(() => setApiUp(false), [])

  let state: ConnectionState
  if (mock) state = 'mock'
  else if (apiUp === null) state = 'checking'
  else state = apiUp ? 'online' : 'offline'

  return { state, forced: MOCK_FORCED, apiUp, setMock, recheck, markOffline }
}
