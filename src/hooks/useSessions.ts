import { useEffect, useState } from 'react'
import type { LiveSessionInfo } from '../liveTypes'
import { fetchSessions } from '../lib/liveApi'
import { fetchMockSessions } from '../lib/mockReplay'

interface Loaded {
  key: string
  sessions: LiveSessionInfo[]
  error: string | null
}

export interface Sessions {
  sessions: LiveSessionInfo[]
  loading: boolean
  error: string | null
}

/** Races available for replay in `year` (sorted by date, oldest first). */
export function useSessions(year: number, useMock: boolean): Sessions {
  const key = `${useMock ? 'mock' : 'api'}:${year}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    const load = useMock ? fetchMockSessions(year) : fetchSessions(year, ctrl.signal)
    load.then(
      (sessions) => {
        if (!ctrl.signal.aborted) setLoaded({ key, sessions, error: null })
      },
      (err: unknown) => {
        if (!ctrl.signal.aborted) {
          setLoaded({ key, sessions: [], error: err instanceof Error ? err.message : String(err) })
        }
      },
    )
    return () => ctrl.abort()
  }, [key, year, useMock])

  if (!loaded || loaded.key !== key) return { sessions: [], loading: true, error: null }
  return { sessions: loaded.sessions, loading: false, error: loaded.error }
}
